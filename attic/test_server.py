import copy
import json
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import server


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.old = server.STATE
        self.oldjob = server.JOB.copy()
        server.STATE = server.initial_state()
        server.JOB.update(running=False,stage='',error=None,done=0,total=0)
        self.persist = patch.object(server,'persist').start()
        self.creds = patch.object(server,'credentials',return_value={}).start()
        self.httpd = ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.httpd.serve_forever,daemon=True)
        self.thread.start()
        self.base=f'http://127.0.0.1:{self.httpd.server_port}'
        self.op=urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close()
        patch.stopall();server.STATE=self.old;server.JOB.update(self.oldjob)

    def request(self,path,body=None,token=True):
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**({'X-Radar-Token':server.SESSION_TOKEN} if token else {})})
        try:
            with self.op.open(req) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e: return e.code,json.load(e)

    def test_secrets_and_arbitrary_files_not_served(self):
        for path in ['/.env','/../.env','/data/state.json','/server.py']:
            self.assertEqual(self.request(path)[0],404)

    def test_mutation_requires_local_session_token(self):
        self.assertEqual(self.request('/api/mode',{'mode':'sample'},False)[0],403)

    def test_validated_requires_trial_checks_and_notes(self):
        o=server.current_opportunities()[0]
        brief=self.request('/api/generate',{'id':o['id']})[1]['brief']
        body={'opportunity_id':o['id'],'brief':brief,'checks':{},'status':'validated','notes':''}
        self.assertEqual(self.request('/api/experiment',body)[0],400)
        body.update(status='draft')
        status,result=self.request('/api/experiment',body)
        self.assertEqual(status,200)
        saved=result['experiment']
        self.assertTrue(saved['evidence'])
        self.assertEqual(saved['mode'],'sample')
        body.update(experiment_id=saved['id'],status='validated',checks={'sources':True,'usable':True,'repeatable':True},notes='Manual test notes')
        self.assertEqual(self.request('/api/experiment',body)[0],200)
        self.assertEqual(len(server.STATE['experiments']),1)
        self.assertEqual(server.STATE['experiments'][0]['evidence'],saved['evidence'])

    def test_total_collection_failure_preserves_previous_dataset(self):
        previous=copy.deepcopy(server.STATE)
        with patch.object(server,'credentials',return_value={'TWITTERAPI_IO_KEY':'test'}), patch.object(server,'http_json',side_effect=ValueError('offline')):
            server.scan_worker(copy.deepcopy(server.STATE['config']))
        self.assertEqual(server.STATE,previous)
        self.assertFalse(server.JOB['running'])
        self.assertIsNotNone(server.JOB['error'])

    def test_empty_success_is_distinct_from_failure(self):
        with patch.object(server,'credentials',return_value={'TWITTERAPI_IO_KEY':'test'}),patch.object(server,'http_json',return_value={'tweets':[],'has_next_page':False}):
            server.scan_worker(copy.deepcopy(server.STATE['config']))
        self.assertEqual(server.STATE['active'],'live')
        self.assertEqual(server.STATE['live']['tweets'],[])
        self.assertTrue(server.STATE['live']['complete'])
        self.assertIsNone(server.JOB['error'])

    def test_invalid_weights_rejected_and_no_key_scan_is_explicit(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['weights']['fit']=90
        self.assertEqual(self.request('/api/config',config)[0],400)
        self.assertEqual(self.request('/api/scan',{})[0],400)

    def test_cached_analysis_failure_preserves_data(self):
        before=copy.deepcopy(server.STATE)
        with patch.object(server,'analyze_with_model',side_effect=ValueError('invalid model output')):
            server.analyze_cached_worker(copy.deepcopy(server.STATE['sample']),server.STATE['config'])
        self.assertEqual(server.STATE,before)
        self.assertEqual(server.JOB['error'],'invalid model output')

    def test_overlong_caption_retains_draft_with_warning(self):
        server.STATE['live']=copy.deepcopy(server.STATE['sample'])
        server.STATE['active']='live'
        o=server.current_opportunities()[0]
        brief=server.template_brief(o)
        brief['caption']='A'*281
        with patch.object(server,'model_json',return_value=(brief,{},'test-model')):
            status,result=self.request('/api/generate',{'id':o['id'],'template':False})
        self.assertEqual(status,200)
        self.assertEqual(len(result['brief']['caption']),281)
        self.assertEqual(len(result['warnings']),1)

class ScanWindowTests(unittest.TestCase):
    """Query construction and window filtering, without any paid API call."""

    def setUp(self):
        self.old = server.STATE
        self.oldjob = server.JOB.copy()
        server.STATE = server.initial_state()
        server.JOB.update(running=False,stage='',error=None,done=0,total=0)
        patch.object(server,'persist').start()
        patch.object(server,'credentials',return_value={'TWITTERAPI_IO_KEY':'k'}).start()

    def tearDown(self):
        patch.stopall();server.STATE=self.old;server.JOB.update(self.oldjob)

    def run_scan(self,config,tweets=(),only=None):
        seen=[]
        def fake(url,headers,payload=None,**kw):
            decoded=urllib.parse.unquote_plus(url)
            seen.append(decoded)
            hit=list(tweets) if (only is None or only in decoded) else []
            return {'tweets':hit,'has_next_page':False}
        patch.object(server,'http_json',side_effect=fake).start()
        server.scan_worker(config)
        return seen,server.STATE['live']

    def post(self,tid,age_days):
        when=datetime.now(timezone.utc)-timedelta(days=age_days)
        return {'id':tid,'text':'I used it to build a deck','author':{'userName':'reader'},
                'createdAt':when.isoformat(),'likeCount':3,'viewCount':100}

    def test_query_with_own_range_is_not_overridden(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['queries']=['"I used Kimi" since:2026-07-01 until:2026-09-05']
        seen,_=self.run_scan(config)
        keyword=[u for u in seen if 'I used Kimi' in u]
        self.assertTrue(keyword)
        self.assertIn('since:2026-07-01',keyword[0])
        self.assertIn('until:2026-09-05',keyword[0])
        self.assertEqual(keyword[0].count('since:'),1)

    def test_competitor_replies_are_collected_as_their_own_source(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        _,ds=self.run_scan(config)
        replies=[c for c in ds['coverage'] if c['source']=='reply']
        self.assertEqual(len(replies),1)
        self.assertIn('to:OpenAI',replies[0]['query'])
        account=[c for c in ds['coverage'] if c['source']=='account']
        self.assertTrue(all('-filter:replies' in c['query'] for c in account))

    def test_top_sliced_run_asks_for_each_period_separately(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config.update(collect_accounts=False,replies=False,query_type='Top',slice_days=7,
                      queries=['"built with" AI since:2026-08-01 until:2026-08-29'])
        seen,ds=self.run_scan(config)
        kw=[c for c in ds['coverage'] if c['source']=='keyword']
        self.assertEqual(len(kw),4)
        self.assertTrue(all('since_time:' in c['query'] and 'until_time:' in c['query'] for c in kw))
        # The operator's own since:/until: must not survive into a slice.
        self.assertTrue(all('since:2026-08-01' not in c['query'] for c in kw))
        self.assertTrue(all('queryType=Top' in u for u in seen))
        self.assertEqual({c['bucket'] if 'bucket' in c else None for c in kw},{None})

    def test_slices_of_one_query_share_a_bucket(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config.update(collect_accounts=False,replies=False,slice_days=7,
                      queries=['"built with" AI since:2026-08-01 until:2026-08-29'])
        inside=datetime(2026,8,10,tzinfo=timezone.utc).isoformat()
        self.run_scan(config,[{'id':'1','text':'I used AI to build a tool','author':{'userName':'a'},
                               'createdAt':inside,'likeCount':30,'viewCount':900}],only='built with')
        self.assertEqual({t['bucket'] for t in server.STATE['live']['tweets']},{'kw0'})

    def test_injected_dates_do_not_count_as_an_operator_range(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['queries']=['"AI slides" lang:en','"I used Kimi" since:2026-07-01']
        _,ds=self.run_scan(config)
        by={c['source']+':'+str(i):c for i,c in enumerate(ds['coverage'])}
        account=[c for c in ds['coverage'] if c['source']=='account']
        self.assertTrue(all(not c['explicit_range'] for c in account))
        keyword=[c for c in ds['coverage'] if c['source']=='keyword']
        self.assertEqual([c['explicit_range'] for c in keyword],[False,True])

    def test_competitor_timelines_can_be_skipped_while_brands_stay_classified(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['collect_accounts']=False
        _,ds=self.run_scan(config)
        sources={c['source'] for c in ds['coverage']}
        self.assertNotIn('reply',sources)
        account=[c for c in ds['coverage'] if c['source']=='account']
        self.assertEqual(len(account),1)
        self.assertIn(config['owned'],account[0]['query'])
        # Brand membership must survive so a competitor post found by a keyword
        # is still excluded from user-demand evidence.
        t=server.normalize({'id':'5','text':'ship it','author':{'userName':'OpenAI'},
                            'createdAt':datetime.now(timezone.utc).isoformat()},config)
        self.assertTrue(t['brand'])

    def test_replies_can_be_switched_off(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['replies']=False
        _,ds=self.run_scan(config)
        self.assertEqual([c for c in ds['coverage'] if c['source']=='reply'],[])

    def test_posts_outside_the_window_are_dropped_and_reported(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['window_days']=8
        _,ds=self.run_scan(config,[self.post('1',2),self.post('2',40)])
        self.assertEqual([t['id'] for t in ds['tweets']],['1'])
        self.assertTrue(all(c['kept']<c['returned'] for c in ds['coverage']))

    def test_a_window_that_discards_everything_warns_instead_of_looking_empty(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        _,ds=self.run_scan(config,[self.post('9',40)])
        self.assertEqual(ds['tweets'],[])
        self.assertTrue(any('时间窗之外' in w for w in ds['warnings']))

    def test_short_window_warns_that_growth_is_hidden(self):
        config=copy.deepcopy(server.DEFAULT_CONFIG)
        config['window_days']=2
        _,ds=self.run_scan(config,[self.post('1',1)])
        self.assertTrue(any('指标基线' in w for w in ds['warnings']))


class AnalysisIntegrityTests(unittest.TestCase):
    """A hallucinated idea must never display, but must not void a paid batch."""

    def setUp(self):
        self.old=server.STATE; server.STATE=server.initial_state()
        self.ds=copy.deepcopy(server.STATE['sample'])
        self.cfg=copy.deepcopy(server.STATE['config'])
        self.real=self.ds['tweets'][0]['id']

    def tearDown(self):
        patch.stopall(); server.STATE=self.old

    def idea(self,title,ids):
        return {'title':title,'problem':'p','audience':'a','angle':'x','topic':'Research',
                'observed_pattern':'o','kimi_adaptation':'k','social_format':'s',
                'risk':'r','next_action':'n','evidence_ids':ids}

    def run_with(self,groups):
        patch.object(server,'model_json',return_value=({'opportunities':groups},{},'m')).start()
        return server.analyze_with_model(self.ds,self.cfg)

    def test_valid_ideas_survive_a_bad_sibling(self):
        self.run_with([self.idea('good',[self.real]),self.idea('ghost',['nope'])])
        self.assertEqual(self.ds['analysis_rejected'],1)
        self.assertEqual(len(server.make_opportunities(self.ds,self.cfg,
            [self.idea('good',[self.real]),self.idea('ghost',['nope'])])),1)
        self.assertTrue(any('被丢弃' in w for w in self.ds['warnings']))

    def test_a_wholly_invalid_response_still_fails(self):
        with self.assertRaises(ValueError):
            self.run_with([self.idea('ghost',['nope'])])


class ConfigWindowTests(ApiTests):
    def runTest(self):
        pass

    def test_window_days_bounds_are_enforced(self):
        base=copy.deepcopy(server.DEFAULT_CONFIG)
        for bad in [0,91,'x']:
            self.assertEqual(self.request('/api/config',{**base,'window_days':bad})[0],400)
        status,_=self.request('/api/config',{**base,'window_days':60})
        self.assertEqual(status,200)
        self.assertEqual(server.STATE['config']['window_days'],60)

    def test_absent_keys_keep_their_stored_value(self):
        base=copy.deepcopy(server.DEFAULT_CONFIG)
        self.request('/api/config',{**base,'window_days':45,'replies':False})
        legacy={k:base[k] for k in ['owned','accounts','queries','pages','weights']}
        self.assertEqual(self.request('/api/config',legacy)[0],200)
        self.assertEqual(server.STATE['config']['window_days'],45)
        self.assertFalse(server.STATE['config']['replies'])

    def test_oversized_sliced_run_is_rejected_before_spending(self):
        base=copy.deepcopy(server.DEFAULT_CONFIG)
        base.update(queries=['x since:2026-01-01 until:2026-09-01'],slice_days=1,pages=5)
        status,result=self.request('/api/config',base)
        self.assertEqual(status,400)
        self.assertIn('200',result['error'])

    def test_query_type_is_restricted(self):
        base=copy.deepcopy(server.DEFAULT_CONFIG)
        self.assertEqual(self.request('/api/config',{**base,'query_type':'Recent'})[0],400)
        self.assertEqual(self.request('/api/config',{**base,'query_type':'top'})[0],200)
        self.assertEqual(server.STATE['config']['query_type'],'Top')

    def test_empty_range_is_rejected_rather_than_returning_nothing(self):
        base=copy.deepcopy(server.DEFAULT_CONFIG)
        base['queries']=['x since:2026-09-05 until:2026-07-01']
        self.assertEqual(self.request('/api/config',base)[0],400)


if __name__=='__main__': unittest.main()
