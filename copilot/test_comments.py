import unittest
from copilot import comments


class Parse(unittest.TestCase):
    def test_formats(self):
        rows = comments.parse("@小林：手机能设吗？ (赞 214)\nKen: can't find it (👍 3)\n- 牛\n\n@bot：重复 重复")
        self.assertEqual([r['author'] for r in rows], ['小林', 'Ken', None, 'bot'])
        self.assertEqual([r['likes'] for r in rows], [214, 3, None, None])


class Guard(unittest.TestCase):
    def g(self, text, model_cat):
        return comments.guard({'text': text, 'model_category': model_cat})

    def test_concrete_legal_claim_is_risk(self):
        cat, flags = self.g('训练数据没有授权吧，已经联系律师了', 'dispute')
        self.assertEqual(cat, 'risk')

    def test_hyperbole_with_sticker_is_negative_not_risk(self):
        cat, flags = self.g('额度问题再不解决要被用户集体诉讼了[笑哭R]', 'product_negative')
        self.assertEqual(cat, 'product_negative')
        self.assertIn('human-look', flags)

    def test_complaint_threat_with_joke_sticker(self):
        cat, flags = self.g('一个 agent 任务把 99会员的全部额度一下用完。我要发帖投诉你们[飞吻R]', 'risk')
        self.assertEqual(cat, 'product_negative')

    def test_mention_only_is_spam(self):
        self.assertEqual(self.g('@水星领航员', 'praise_short')[0], 'mention_spam')

    def test_quota_complaint_is_negative_with_topic_tag(self):
        cat, flags = self.g('每次用都说人数太多，排队排不上会员', 'product_negative')
        self.assertEqual(cat, 'product_negative')
        self.assertIn('topic:quota', flags)
        self.assertEqual(self.g('每次用都说人数太多，排队排不上会员', 'quota')[0], 'product_negative')


class Decide(unittest.TestCase):
    def rows(self):
        base = {'flags': [], 'answerable': True, 'dup_group': None, 'reason': '', 'author': None, 'likes': 0}
        return [dict(base, id='c1', text='这是html还是ppt', category='fact_qa'),
                dict(base, id='c2', text='怎么用', category='howto_qa', dup_group='howto'),
                dict(base, id='c3', text='这个怎么用啊', category='howto_qa', dup_group='howto'),
                dict(base, id='c4', text='什么时候能不429', category='product_negative', flags=['topic:quota']),
                dict(base, id='c12', text='导出字体丢了', category='product_negative'),
                dict(base, id='c5', text='希望增加北大法宝', category='feature_request'),
                dict(base, id='c6', text='退款没到', category='account'),
                dict(base, id='c7', text='需要哪种订阅才能用ppt', category='fact_qa', answerable=False),
                dict(base, id='c8', text='已经联系律师了', category='risk'),
                dict(base, id='c9', text='求教程', category='tutorial_request'),
                dict(base, id='c10', text='有教程嘛', category='tutorial_request'),
                dict(base, id='c11', text='数学老师心动了', category='praise_rich')]

    def test_actions(self):
        rows = {r['id']: r for r in comments.decide(self.rows())}
        self.assertEqual(rows['c1']['action'], 'draft')
        self.assertEqual(rows['c2']['action'], 'draft')
        self.assertEqual(rows['c3']['action'], 'apply')
        self.assertEqual(rows['c3']['apply_from'], 'c2')
        self.assertEqual(rows['c4']['action'], 'none')   # quota topic: counted only
        self.assertEqual(rows['c4']['tag'], 'quota')
        self.assertEqual(rows['c12']['action'], 'look')  # other negatives: human look
        self.assertEqual(rows['c5']['action'], 'archive')
        self.assertEqual(rows['c5']['tag'], 'feature-request')
        self.assertEqual(rows['c6']['action'], 'route')
        self.assertEqual(rows['c7']['action'], 'look')
        self.assertEqual(rows['c8']['action'], 'look')
        self.assertNotIn('draft', rows['c8'])
        self.assertEqual(rows['c9']['action'], 'draft')   # tutorial: first asker only
        self.assertEqual(rows['c10']['action'], 'archive')
        self.assertEqual(rows['c10']['tag'], 'tutorial-request')
        self.assertEqual(rows['c11']['action'], 'optional')

    def test_order_puts_risk_first(self):
        self.assertEqual(comments.decide(self.rows())[0]['category'], 'risk')


class ReplyLint(unittest.TestCase):
    def test_mirror_and_rules(self):
        self.assertTrue(comments.lint_reply('这是pptx[笑哭R]', '这是html[笑哭R]')['pass'])
        self.assertFalse(comments.lint_reply('这是pptx[萌萌哒R]', '这是html[笑哭R]')['pass'])
        self.assertFalse(comments.lint_reply('看这里 https://kimi.com', '怎么用')['pass'])
        self.assertFalse(comments.lint_reply('比豆包好用', '豆包和kimi哪个好')['pass'])


if __name__ == '__main__':
    unittest.main()
