import copy
import unittest
from datetime import datetime, timedelta, timezone
from engine import (DEFAULT_CONFIG, METRIC_WINDOW_DAYS, IDEA_FIELDS, normalize, make_opportunities,
                    dashboard, sample_dataset, template_brief, query_window,
                    mechanical_filter, evidence_strength, social_potential, percentile,
                    engagement_rate, amplification)

IDEA = {'title':'Example','problem':'Need','audience':'Analysts','angle':'Test','topic':'Research',
        'observed_pattern':'Creators share report-to-deck workflows.',
        'kimi_adaptation':'Give Kimi a public report, ask for a source-linked deck.',
        'social_format':'Before / after demo','risk':'May look like competitor content.',
        'next_action':'Run it once with a real report.'}


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.config = copy.deepcopy(DEFAULT_CONFIG)
        self.ds = sample_dataset(self.config)

    def test_missing_metrics_are_not_zero(self):
        t = normalize({'id': '123', 'text': 'AI research', 'author': {'userName': 'reader'}, 'likeCount': 0}, self.config)
        self.assertEqual(t['likes'], 0)
        self.assertIsNone(t['views'])
        self.assertIsNone(t['quotes'])

    def test_dashboard_uses_only_complete_rates_and_matched_age(self):
        anchor = datetime.now(timezone.utc)
        def post(tid, hours, views, likes):
            return normalize({'id': str(tid), 'text': 'A research report', 'author': {'userName': self.config['owned']}, 'createdAt': (anchor-timedelta(hours=hours)).isoformat(), 'viewCount': views, 'likeCount': likes, 'replyCount': 0, 'retweetCount': 0, 'quoteCount': 0}, self.config)
        self.ds.update(collected_at=anchor.isoformat(), tweets=[post(1, 30, 1000, 10), post(2, 40, None, 20), post(3, 50, 0, 10), post(4, 60, 1000, None), post(5, 1, 100000, 1000), post(6, 220, 100000, 1000)])
        own=dashboard(self.ds,self.config)['accounts'][0]
        self.assertEqual(own['posts'],4)
        self.assertEqual(own['rate_n'],1)
        self.assertEqual(own['interaction_rate'],10)
        self.assertEqual(own['views_n'],3)
        self.assertEqual(own['median_views'],1000)

    def test_missing_or_unknown_dates_do_not_qualify(self):
        self.ds['tweets'] = [normalize({'id': '100', 'text': 'research report','author':{'userName':self.config['owned']},'createdAt':'not a date'},self.config)]
        self.assertEqual(dashboard(self.ds,self.config)['accounts'][0]['posts'],0)

    def test_partial_collection_hides_all_growth_ratios(self):
        self.ds['complete']=False
        self.assertTrue(all(o['growth'] is None for o in make_opportunities(self.ds,self.config)))

    def test_brand_posts_are_not_counted_as_user_demand(self):
        self.ds['tweets']=[t for t in self.ds['tweets'] if t['brand']]
        for o in make_opportunities(self.ds,self.config):
            self.assertEqual(o['needs'],0)
            self.assertEqual(o['authors'],0)
            self.assertEqual(o['action'],'先核实用户需求')

    def test_incomplete_idea_card_is_rejected(self):
        for missing in IDEA_FIELDS:
            group={k:v for k,v in IDEA.items() if k!=missing}
            group['evidence_ids']=[self.ds['tweets'][0]['id']]
            self.assertEqual(make_opportunities(self.ds,self.config,[group]),[],missing)

    def test_model_cannot_invent_evidence(self):
        group=dict(IDEA,evidence_ids=['made-up-id'])
        self.assertEqual(make_opportunities(self.ds,self.config,[group]),[])
        group['evidence_ids']=[self.ds['tweets'][0]['id']]
        self.assertEqual(len(make_opportunities(self.ds,self.config,[group])),1)
        group['topic']='Video'
        self.assertEqual(make_opportunities(self.ds,self.config,[group]),[])

    def test_empty_dataset_produces_no_opportunities(self):
        self.ds['tweets']=[]
        self.assertEqual(make_opportunities(self.ds,self.config),[])
        self.assertTrue(all(r['median_views'] is None for r in dashboard(self.ds,self.config)['accounts']))

    def test_sample_cannot_masquerade_as_real_post(self):
        self.assertTrue(all(t['sample'] and t['url'] is None for t in self.ds['tweets']))

    def test_templates_keep_captions_within_limit(self):
        for o in make_opportunities(self.ds,self.config):
            brief=template_brief(o)
            self.assertLessEqual(len(brief['caption']),280)
            self.assertLessEqual(len(brief['caption_alt']),280)


class WindowTests(unittest.TestCase):
    def setUp(self):
        self.config = copy.deepcopy(DEFAULT_CONFIG)
        self.end = datetime(2026, 9, 8, tzinfo=timezone.utc)

    def test_rolling_default_when_query_has_no_range(self):
        start, stop, explicit = query_window('("AI slides") lang:en', self.end, 8)
        self.assertFalse(explicit)
        self.assertEqual(stop, self.end)
        self.assertEqual((self.end-start).days, 8)

    def test_explicit_range_overrides_rolling_window(self):
        q = '"I used Kimi" since:2026-07-01 until:2026-09-05'
        start, stop, explicit = query_window(q, self.end, 8)
        self.assertTrue(explicit)
        self.assertEqual(start, datetime(2026, 7, 1, tzinfo=timezone.utc))
        self.assertEqual(stop, datetime(2026, 9, 5, tzinfo=timezone.utc))

    def test_until_never_reaches_past_collection_time(self):
        _, stop, _ = query_window('x until:2027-01-01', self.end, 8)
        self.assertEqual(stop, self.end)

    def test_unparsable_date_falls_back_instead_of_raising(self):
        start, _, _ = query_window('x since:2026-13-45', self.end, 8)
        self.assertEqual((self.end-start).days, 8)

    def test_growth_withheld_when_window_shorter_than_baseline(self):
        ds = sample_dataset(self.config)
        self.config['window_days'] = 2
        self.assertTrue(all(o['growth'] is None for o in make_opportunities(ds, self.config)))

    def test_dashboard_window_ignores_a_wider_collection_window(self):
        ds = sample_dataset(self.config)
        self.config['window_days'] = 60
        anchor = dashboard(ds, self.config)
        for t in anchor['posts']:
            age = datetime.fromisoformat(ds['collected_at'])-datetime.fromisoformat(t['created_at'])
            self.assertLess(age, timedelta(days=METRIC_WINDOW_DAYS))


class ScoringTests(unittest.TestCase):
    """Both axes are deterministic: no model call decides ranking."""

    def tweet(self,tid,handle,likes,views,followers,text='I used AI to build a tool',bucket='kw0'):
        return {'id':tid,'handle':handle,'text':text,'likes':likes,'replies':0,'reposts':0,'quotes':0,
                'views':views,'followers':followers,'is_repost':False,'is_reply':False,'brand':False,
                'bucket':bucket,'signal':'Workflow example','topic':'Research',
                'created_at':datetime.now(timezone.utc).isoformat()}

    def test_one_off_can_outrank_a_broad_but_flat_pattern(self):
        viral=[self.tweet('1','solo',300,3000,900)]
        flat=[self.tweet(str(i),f'u{i}',20,20000,50000) for i in range(2,7)]
        ranks={'rate':percentile([engagement_rate(t) for t in viral+flat]),
               'amp':percentile([amplification(t) for t in viral+flat])}
        one,_=social_potential(viral,ranks)
        many,_=social_potential(flat,ranks)
        self.assertGreater(one,many)
        # ...while evidence strength still says the one-off is thin.
        self.assertLess(evidence_strength(1,1),evidence_strength(5,1))

    def test_social_score_is_withheld_without_metrics(self):
        blind=[self.tweet('1','a',10,None,None)]
        score,detail=social_potential(blind,{'rate':{},'amp':{}})
        self.assertIsNone(score)
        self.assertEqual(detail['rate_n'],0)

    def test_recurrence_across_buckets_raises_evidence_only(self):
        self.assertEqual(evidence_strength(3,2)-evidence_strength(3,1),10)

    def test_growth_is_withheld_for_top_sampling(self):
        config=copy.deepcopy(DEFAULT_CONFIG); config['query_type']='Top'
        ds=sample_dataset(config)
        self.assertTrue(all(o['growth'] is None for o in make_opportunities(ds,config)))


class FilterTests(unittest.TestCase):
    def tweet(self,tid,text,handle='a',likes=10,brand=False,repost=False):
        return {'id':tid,'handle':handle,'text':text,'likes':likes,'replies':0,'reposts':0,'quotes':0,
                'views':100,'followers':100,'is_repost':repost,'is_reply':False,'brand':brand,
                'signal':'Workflow example','topic':'Research','created_at':None}

    def test_copypasta_is_removed_keeping_the_strongest_copy(self):
        text='Finally tested the model and built a city scene from one image'
        kept,report=mechanical_filter([self.tweet('1',text,'a',likes=5),self.tweet('2',text,'b',likes=90)])
        self.assertEqual([t['id'] for t in kept],['2'])
        self.assertEqual(report['dropped']['near_duplicate'],1)

    def test_bait_is_removed_but_brand_demos_are_kept_and_labelled(self):
        kept,report=mechanical_filter([
            self.tweet('1','5 prompts that will change how you work'),
            self.tweet('2','Introducing our new model, here is a demo',brand=True),
            self.tweet('3','I used it to clean a messy CSV for a client report')])
        # A competitor launch is valid input for what is being demonstrated.
        self.assertEqual([t['id'] for t in kept],['2','3'])
        self.assertEqual(report['dropped']['promo'],1)
        self.assertEqual(report['brand_kept'],1)
        self.assertEqual(report['input'],3)

    def test_listicle_and_income_bait_are_removed(self):
        bait=['If you\'re building a startup here are the 10 best GitHub repos',
              'HOW TO BUILD A FACELESS YOUTUBE CHANNEL with Claude',
              'CLAUDE CAN HELP YOU BUILD A REMOTE INCOME without coding']
        for i,text in enumerate(bait):
            kept,_=mechanical_filter([self.tweet(str(i),text)])
            self.assertEqual(kept,[],text)

    def test_pricing_and_comparison_posts_are_not_mistaken_for_bait(self):
        legit=['You are paying $20/month for a coding agent that runs one model',
               'I asked ChatGPT, Gemini and Claude the same question and compared the answers',
               'I used Claude to turn a 60 page report into an editable deck']
        for i,text in enumerate(legit):
            kept,_=mechanical_filter([self.tweet(str(i),text)])
            self.assertEqual(len(kept),1,text)


if __name__ == '__main__':
    unittest.main()
