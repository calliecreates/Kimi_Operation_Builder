import unittest
from copilot import voice

FACTS = "F1: Scheduled Tasks is now live in Kimi Work\nF2: runs every day at 8 a.m.\nF3: supports macOS and Windows"


def x(text, lines=None):
    lines = lines or [{'text': t, 'kind': 'claim' if t else 'structure', 'sources': ['F1']} for t in text.split('\n')]
    return voice.lint_x({'text': text, 'lines': lines}, FACTS)


def status(res, id_):
    return next(c['status'] for c in res['checks'] if c['id'] == id_)


class LintX(unittest.TestCase):
    def test_clean_post_passes(self):
        r = x("Scheduled Tasks is now live in Kimi Work.\n\nSet it once and your desktop agent runs it every day at 8 a.m.")
        self.assertEqual(r['summary']['fail'], 0)
        self.assertEqual(status(r, 'grounded'), 'pass')

    def test_hype_question_hashtag_fail(self):
        r = x("Scheduled Tasks is now live in Kimi Work. Revolutionary!! Who's excited? #AI")
        for id_ in ('no_hype', 'no_question', 'no_hashtag', 'single_exclaim'):
            self.assertEqual(status(r, id_), 'fail', id_)

    def test_unscoped_sota_and_putdown(self):
        r = x("Kimi K3 is now #1 on Design Arena. It crushes GPT.")
        self.assertEqual(status(r, 'sota_scoped'), 'fail')
        self.assertEqual(status(r, 'no_putdown'), 'fail')

    def test_scoped_sota_ok(self):
        r = x("Kimi K3 is now #1 open model on Design Arena.")
        self.assertEqual(status(r, 'sota_scoped'), 'pass')

    def test_number_not_in_brief_is_flagged(self):
        r = x("Scheduled Tasks is now live in Kimi Work. Up to 6x faster.")
        self.assertEqual(status(r, 'grounded'), 'fail')
        self.assertIn('6', r['flagged'][0]['why'])

    def test_unsourced_claim_is_flagged(self):
        r = x("Scheduled Tasks is now live in Kimi Work.", [{'text': 'Scheduled Tasks is now live in Kimi Work.', 'kind': 'claim', 'sources': []}])
        self.assertEqual(status(r, 'grounded'), 'fail')

    def test_placeholder_is_not_a_claim(self):
        r = x("Scheduled Tasks is now live in Kimi Work.\n🔗 Try it now: [待确认：link]")
        self.assertEqual(status(r, 'grounded'), 'pass')
        self.assertEqual(r['placeholders'], ['[待确认：link]'])

    def test_product_name_spelling(self):
        self.assertEqual(status(x("Kimi-K3 is now live in KimiWork."), 'product_names'), 'fail')


class LintXHS(unittest.TestCase):
    BODY = ("以后早报不用自己写了[萌萌哒R] Kimi Work「定时任务」今天上线～\n\n🌓 如何开启？\n1️⃣ 点击输入框左下角的「+」（见图2）\n2️⃣ 选择「定时任务」\n\n"
            "有想让它定时做的事？评论区许愿，K都在看[拔草R]\n#kimi[话题]# #kimiwork[话题]#")

    def lint(self, title=None, body=None, tags=None, register='casual'):
        body = body if body is not None else self.BODY
        c = {'title': title or 'Kimi Work定时任务上线！以后早报自己写', 'body': body, 'tags': tags if tags is not None else ['kimi', 'kimiwork'],
             'lines': [{'text': t, 'kind': 'tag' if t.startswith('#') else ('claim' if t else 'structure'), 'sources': ['F1']} for t in body.split('\n')]}
        return voice.lint_xhs(c, FACTS, register)

    def test_casual_note_passes(self):
        r = self.lint()
        self.assertEqual(r['summary']['fail'], 0, [c for c in r['checks'] if c['status'] == 'fail'])

    def test_title_length(self):
        self.assertEqual(status(self.lint(title='太短'), 'title'), 'fail')

    def test_tags_must_start_with_kimi(self):
        self.assertEqual(status(self.lint(tags=['kimiwork', 'kimi']), 'tags'), 'fail')

    def test_casual_needs_ask_and_persona(self):
        r = self.lint(body="Kimi Work「定时任务」今天上线。\n1️⃣ 点击「+」（见图2）\n#kimi[话题]#")
        self.assertEqual(status(r, 'register'), 'fail')
        self.assertEqual(status(r, 'ask'), 'fail')

    def test_formal_rejects_stickers(self):
        r = self.lint(body="今天，我们正式推出定时任务。[萌萌哒R]\n#kimi[话题]#", register='launch')
        self.assertEqual(status(r, 'register'), 'fail')

    def test_zhubo_fails(self):
        self.assertEqual(status(self.lint(body=self.BODY.replace('以后早报', '家人们！震惊，早报')), 'no_zhubo'), 'fail')

    def test_step_numbers_and_stickers_do_not_trip_units_or_spacing(self):
        r = self.lint()
        self.assertEqual(status(r, 'units'), 'pass')
        self.assertEqual(status(r, 'spacing'), 'pass')


if __name__ == '__main__':
    unittest.main()
