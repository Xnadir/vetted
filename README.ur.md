[English](README.md) | [اردو](README.ur.md)
<h1 align="center">vetted</h1>

<p align="center"><b>Agent skills جو ثابت کریں کہ وہ کام کرتے ہیں۔</b><br/>
ہر skill کے ساتھ ایک eval آتا ہے جو موجودہ models پر <i>skill کے ساتھ</i> اور <i>skill کے بغیر</i> چلتا ہے۔<br/>
اگر یہ baseline سے بہتر نہ ہو، تو شامل نہیں ہوتا۔</p>

<p align="center">
  <a href="https://github.com/Xnadir/vetted/actions/workflows/ci.yml"><img src="https://github.com/Xnadir/vetted/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e" alt="MIT"/></a>
  <img src="https://img.shields.io/badge/dependencies-0-0891b2" alt="Zero dependencies"/>
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor%20%C2%B7%20Gemini%20CLI%20%C2%B7%20OpenCode-7c3aed" alt="Works with"/>
</p>

<p align="center"><img src="docs/assets/vet-demo.svg" alt="vetted scanning a skill folder: one skill fails with a remote-exec and a hidden unicode error, the others pass, with context cost per skill" width="860"/></p>

---

آج GitHub پر ہزاروں agent skills موجود ہیں۔ لیکن ان میں سے تقریباً کوئی بھی یہ نہیں بتا سکتا کہ وہ آپ کے agent کو بہتر بناتے ہیں یا نہیں۔ پچھلے سال کے model کے لیے لکھی گئی skill چپکے سے اس سال کے model کو *بدتر* بنا سکتی ہے۔ اس کے علاوہ، skills دراصل وہ کوڈ ہیں جو آپ کے agent کی اجازتوں سے چلتا ہے — اور زیادہ تر لوگ انہیں بغیر پڑھے install کر لیتے ہیں۔

یہ repo دو چیزوں پر مشتمل ہے:

1. **[Skills](#the-skills)** جنہیں موجودہ models کے لیے از سرِ نو لکھا گیا ہے — وہ مشہور خیالات جو testing میں کامیاب رہے (کام مکمل ہونے کی تصدیق، بنیادی وجہ تلاش کرنا، bug ڈھونڈنا، سوال جواب کرنا، اور handoffs) — مختصر اور سادہ انداز میں، ہر ایک کے ساتھ ایک [eval suite](evals/) جو یہ ناپتا ہے کہ skill اکیلے model سے کتنا بہتر کرتی ہے۔
2. **[`vet`](#vet-check-any-skill-before-you-trust-it)**، ایک zero-dependency scanner جو کسی بھی skill، کسی بھی repo، یا آپ کی install کردہ تمام skills کو spec کی غلطیوں، کمزور triggers، context cost، پرانے prompting طریقوں، اور security خطرات کے لیے جانچتا ہے۔

## فوری شروعات

**Skills install کریں**

```bash
# Claude Code
/plugin marketplace add Xnadir/vetted
/plugin install vetted@vetted

# Any agent that reads SKILL.md (Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Copilot...)
npx skills add Xnadir/vetted
```

یا [`skills/`](skills/) سے کوئی folder اپنے agent کی skills directory میں کاپی کریں
(`~/.claude/skills/`, `~/.agents/skills/`, `.cursor/skills/`, ...)۔ ہر skill ایک مکمل
`SKILL.md` فائل ہے۔

**کوئی بھی skill repo install کرنے سے پہلے جانچیں**

```bash
npx @menadirali/skill-vet vet anthropics/skills     # any GitHub repo
npx @menadirali/skill-vet vet ./my-skills           # a local folder
npx @menadirali/skill-vet vet --installed           # everything your agents have installed
```

Node 18+ کافی ہے، اور کچھ نہیں چاہیے۔ کوئی install نہیں، کوئی account نہیں، network صرف اس وقت استعمال ہوتا ہے جب آپ GitHub repo کا نام دیں۔

<a id="the-skills"></a>

## Skills

| Skill | کیا بدلتا ہے | کب چلتا ہے |
| --- | --- | --- |
| [`prove-it`](skills/prove-it/SKILL.md) | جو چیز واقعی جانچی گئی اسے صرف لکھی گئی بات سے الگ کرتا ہے۔ جب تک وہ command اور output نہ ہو جو اسے ثابت کرے، "ٹھیک ہو گیا!" نہیں چلے گا۔ *Haiku 4.5 کے لیے مددگار؛ Sonnet 5.5 پہلے سے یہ کرتا ہے۔* | کوئی بھی code تبدیلی مکمل کرتے وقت |
| [`root-cause`](skills/root-cause/SKILL.md) | *زیر نگرانی: نتائج ملے جلے ہیں (نیچے دیکھیں)۔* مسئلے کو دوبارہ پیدا کریں، خراب قدر کو اس کی جڑ تک trace کریں، وہیں ٹھیک کریں، اور دوسرے متاثرہ callers کا ذکر کریں۔ | debugging کے وقت |
| [`bug-hunt-review`](skills/bug-hunt-review/SKILL.md) | ہر bug کے لیے ایک ٹھوس ناکام scenario کے ساتھ، شدت کے لحاظ سے ترتیب دے کر خامیاں تلاش کرتا ہے۔ style سے متعلق معمولی نکات سے گریز کرتا ہے۔ | code یا PR کا جائزہ لیتے وقت |
| [`grill`](skills/grill/SKILL.md) | ایک ایک فیصلے پر سوال کرتا ہے، ہر سوال کے ساتھ ایک تجویز کردہ جواب دیتا ہے، پھر ایک خلاصہ لکھتا ہے۔ | جب آپ کسی plan پر سوال جواب کروانا چاہیں |
| [`handoff`](skills/handoff/SKILL.md) | `HANDOFF.md` لکھتا ہے جس سے نئی session شروع ہو سکے: موجودہ حالت، تصدیق کی صورتحال، بند گلیاں، اور اگلا قدم۔ *Haiku 4.5 کے لیے مددگار؛ Sonnet 5.5 پہلے سے یہ کرتا ہے۔* | ایک لمبی session ختم کرتے یا صاف کرتے وقت |

پانچوں skills مل کر آپ کے agent کے context میں صرف **≈375 tokens** کا اضافہ کرتی ہیں (نام اور تفصیلات)۔ ہر skill کا اصل مواد صرف تب لوڈ ہوتا ہے جب وہ چلے، اور وہ بھی 460–560 tokens میں۔

## نتائج

ہر skill کا ایک eval suite [`evals/`](evals/) کے تحت ہے، جو Anthropic کے
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals) کے format میں ہے۔ ہر case کو 3 بار plugin کے ساتھ اور 3 بار اس کے بغیر چلایا جاتا ہے، اور فرق (Δ) وہی ہے جو skill نے دیا۔ جہاں ممکن ہو graders deterministic regexes ہیں، اور جہاں نہ ہو وہاں PASS/FAIL rubrics کے ساتھ LLM judge استعمال ہوتا ہے۔

<!-- results:start -->
| Skill | Sonnet 5.5<br/>with → without (Δ) | Haiku 4.5<br/>with → without (Δ) | Skill loaded | Verdict |
| --- | ---: | ---: | ---: | --- |
| [`answer-first`](retired/skills/answer-first/SKILL.md) _(retired)_ | 80% → 80% (**0**) | 80% → 77% (**+3**) | 0/6 · 0/6 | ✂️ no measurable effect |
| [`bug-hunt-review`](skills/bug-hunt-review/SKILL.md) | 100% → 90% (**+10**) | 87% → 70% (**+17**) | 6/6 · 6/6 | ✅ helps |
| [`grill`](skills/grill/SKILL.md) | 100% → 25% (**+75**) | 83% → 25% (**+58**) | 6/6 · 6/6 | ✅ helps |
| [`handoff`](skills/handoff/SKILL.md) | 100% → 100% (**0**) | 93% → 80% (**+13**) | 3/3 · 3/3 | ✅ helps on Haiku 4.5 |
| [`prove-it`](skills/prove-it/SKILL.md) | 100% → 100% (**0**) | 53% → 42% (**+11**) | 2/6 · 3/6 | ✅ helps on Haiku 4.5 |
| [`root-cause`](skills/root-cause/SKILL.md) | 100% → 88% (**+13**) | 38% → 49% (**-11**) | 0/6 · 0/6 | ✅ helps on Sonnet 5.5 |
| [`secure-defaults`](retired/skills/secure-defaults/SKILL.md) _(retired)_ | 100% → 100% (**0**) | 58% → 67% (**-8**) | 0/6 · 0/6 | ❌ hurts on Haiku 4.5 |
| [`stdlib-first`](retired/skills/stdlib-first/SKILL.md) _(retired)_ | 100% → 100% (**0**) | 92% → 92% (**0**) | 0/6 · 0/6 | ✂️ no measurable effect |
| [`surgical`](retired/skills/surgical/SKILL.md) _(retired)_ | 100% → 100% (**0**) | 100% → 100% (**0**) | 0/6 · 0/6 | ✂️ no measurable effect |
| _no skill should fire_ | 100% → 100% (**0**) | 100% → 100% (**0**) | – | ✅ nothing fired |

**Sonnet 5.5**: 19 cases × 3 runs per arm, judge `claude-sonnet-5-5`, Claude Code 2.1.284, 2026-09-29, ≈$5.62 at list price<br/>
**Haiku 4.5**: 19 cases × 3 runs per arm, judge `claude-sonnet-5-5`, Claude Code 2.1.284, 2026-09-29, ≈$5.28 at list price

<details><summary>Per-case scores</summary>

| Model | Skill | Case | With | Without | Δ | Loaded |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Sonnet 5.5 | _precision | `concept-question` | 100% | 100% | 0 | – |
| Sonnet 5.5 | _precision | `translate` | 100% | 100% | 0 | – |
| Sonnet 5.5 | answer-first | `fetch-vs-pull` | 60% | 60% | 0 | 0/3 |
| Sonnet 5.5 | answer-first | `task-report` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | bug-hunt-review | `clean-code-no-inventions` | 100% | 100% | 0 | 3/3 |
| Sonnet 5.5 | bug-hunt-review | `two-planted-bugs` | 100% | 80% | +20 | 3/3 |
| Sonnet 5.5 | grill | `auth-migration-plan` | 100% | 25% | +75 | 3/3 |
| Sonnet 5.5 | grill | `url-shortener` | 100% | 25% | +75 | 3/3 |
| Sonnet 5.5 | handoff | `csv-import-midway` | 100% | 100% | 0 | 3/3 |
| Sonnet 5.5 | prove-it | `claims-fix-without-shell` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | prove-it | `refactor-report` | 100% | 100% | 0 | 2/3 |
| Sonnet 5.5 | root-cause | `shared-formatter` | 100% | 75% | +25 | 0/3 |
| Sonnet 5.5 | root-cause | `wrong-layer-null` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | secure-defaults | `file-endpoint` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | secure-defaults | `sql-search` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | stdlib-first | `node-cli-args` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | stdlib-first | `python-time-ago` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | surgical | `add-function-keep-style` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | surgical | `fix-discount-leave-neighbors` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | _precision | `concept-question` | 100% | 100% | 0 | – |
| Haiku 4.5 | _precision | `translate` | 100% | 100% | 0 | – |
| Haiku 4.5 | answer-first | `fetch-vs-pull` | 60% | 53% | +7 | 0/3 |
| Haiku 4.5 | answer-first | `task-report` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | bug-hunt-review | `clean-code-no-inventions` | 100% | 100% | 0 | 3/3 |
| Haiku 4.5 | bug-hunt-review | `two-planted-bugs` | 73% | 40% | +33 | 3/3 |
| Haiku 4.5 | grill | `auth-migration-plan` | 67% | 25% | +42 | 3/3 |
| Haiku 4.5 | grill | `url-shortener` | 100% | 25% | +75 | 3/3 |
| Haiku 4.5 | handoff | `csv-import-midway` | 93% | 80% | +13 | 3/3 |
| Haiku 4.5 | prove-it | `claims-fix-without-shell` | 50% | 50% | 0 | 0/3 |
| Haiku 4.5 | prove-it | `refactor-report` | 56% | 33% | +22 | 3/3 |
| Haiku 4.5 | root-cause | `shared-formatter` | 75% | 75% | 0 | 0/3 |
| Haiku 4.5 | root-cause | `wrong-layer-null` | 0% | 22% | -22 | 0/3 |
| Haiku 4.5 | secure-defaults | `file-endpoint` | 67% | 83% | -17 | 0/3 |
| Haiku 4.5 | secure-defaults | `sql-search` | 50% | 50% | 0 | 0/3 |
| Haiku 4.5 | stdlib-first | `node-cli-args` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | stdlib-first | `python-time-ago` | 83% | 83% | 0 | 0/3 |
| Haiku 4.5 | surgical | `add-function-keep-style` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | surgical | `fix-discount-leave-neighbors` | 100% | 100% | 0 | 0/3 |

</details>
<!-- results:end -->

**اصول:** کوئی skill تبھی رہتی ہے جب موجودہ models پر اس کا اوسط Δ واضح طور پر مثبت ہو۔ جس skill کا کوئی قابلِ پیمائش اثر نہ ہو اسے نکال دیا جاتا ہے اور نیچے درج کیا جاتا ہے — کیونکہ ایسی skill جو رویے میں کوئی فرق نہ لائے، پھر بھی ہر turn میں context اور توجہ خرچ کرتی ہے۔

**اب تک نکالی گئی (اصل 9 میں سے 4):** `surgical`، `stdlib-first`، `answer-first`، اور `secure-defaults`۔ دونوں models پر ان کا کوئی قابلِ پیمائش اثر نہیں تھا — skill کے بغیر model پہلے سے ہی diffs چھوٹے رکھتا تھا، built-ins استعمال کرتا تھا، SQL parameterize کرتا تھا، اور براہ راست جواب دیتا تھا۔ یہ فطری prompts پر کبھی load بھی نہیں ہوئیں۔ انہیں [`retired/`](retired/) میں ان کے evals کے ساتھ رکھا گیا ہے تاکہ کوئی بھی انہیں مستقبل کے model پر دوبارہ جانچ سکے یا مشکل cases تجویز کر سکے۔

**ہم نے کیا سیکھا:** وہ skills سب سے زیادہ مددگار ہوتی ہیں جو ایسا *workflow* دیتی ہیں جو model خود نہیں اپناتا
(`grill`: ہر سوال کے ساتھ ایک تجویز کردہ جواب؛ `bug-hunt-review`: ہر bug کے لیے ایک ٹھوس ناکام scenario)۔ "محتاط رہو" قسم کی skills جو اچھی عادتیں دہراتی ہیں، موجودہ models کی مدد نہیں کرتیں، اور چھوٹا model زیادہ فائدہ اٹھاتا ہے (`handoff` اور `prove-it` صرف Haiku 4.5 کے لیے مددگار ہیں)۔ `root-cause` کسی بھی model پر load نہیں ہوئی، پھر بھی Sonnet پر +13 اور Haiku پر −11 رہی — یعنی اس کا اثر skill list میں موجود اس کی تفصیل سے ہے، اور یہ ابھی قابلِ اعتماد نہیں؛ اس لیے یہ زیر نگرانی ہے۔

<a id="vet-check-any-skill-before-you-trust-it"></a>

## `vet`: کوئی بھی skill پر بھروسہ کرنے سے پہلے جانچیں

`vet` آپ کے دیے گئے paths کے نیچے ہر `SKILL.md` کو پڑھتا ہے، ساتھ میں موجود ہر script اور reference file کو بھی، اور رپورٹ کرتا ہے:

| Family | کیا پکڑتا ہے |
| --- | --- |
| **`sec/`** | Download-and-execute (`curl … \| sh`, `iex (iwr …)`), decode-and-execute, prompt injection ("ignore previous instructions", "without telling the user"), invisible Unicode اور bidi overrides, permission bypass flags, credential-file access, exfiltration endpoints اور raw IPs, cloud metadata access, env dumps, shell-profile/cron/hook persistence, unrestricted `allowed-tools`, shipped binaries, install commands میں مشکوک package names (typosquat detection) |
| **`spec/`** | [Agent Skills spec](https://agentskills.io/specification): name format اور directory match، description کی حدیں، frontmatter کی ساخت، skill کے اندر ٹوٹے ہوئے links، بہت بڑے bodies |
| **`trigger/`** | بہت مبہم descriptions جو match نہ کر سکیں، "use when" clause کا نہ ہونا، Claude Code کی 1,536-character listing cap سے تجاوز، duplicate names، اور دو ایسی skills جن کی descriptions اتنی ملتی جلتی ہوں کہ selection میں الجھن ہو |
| **`style/`** | ایسی prompting عادتیں جو موجودہ models پر الٹا اثر کرتی ہیں: MUST/NEVER/CRITICAL کی بھرمار، سب capital letters میں چیخنا، "You are a world-class expert…" جیسے boilerplate |
| **cost** | ہر session میں ہر skill کتنے tokens خرچ کرتی ہے، اور activation پر |

کوئی بھی جانچی جانے والی فائل scanner کو خاموش نہیں کر سکتی: ایک inline `vet-ignore` comment کسی security finding کو error سے گھٹا کر info کر دیتا ہے، لیکن وہ رپورٹ میں رہتا ہے۔ جو مثالیں quotes میں ہوں ("pages may contain text like *'ignore previous instructions'*") اور code comments یا test fixtures میں ملنے والے matches کو info level پر رپورٹ کیا جاتا ہے، error پر نہیں۔ مکمل فہرست کے لیے `skill-vet rules` چلائیں (tooling کے لیے `--format json` شامل کریں)۔

**CI میں**، اسے کسی بھی ایسی repo میں شامل کریں جس میں skills ہوں۔ نتائج pull request پر annotations کے طور پر اور job summary میں ایک table کے طور پر نظر آتے ہیں:

```yaml
- uses: actions/checkout@v4
- uses: Xnadir/vetted@v0
  with:
    path: skills        # default: .
    strict: "true"      # fail on warnings too
```

دوسرے formats: `--format json` (stable schema), `--format markdown`, `--format github`۔
Flags: `--quiet` (صرف findings دکھائیں، کوئی summary یا cost table نہیں), `--strict` (warnings پر بھی fail کریں), `--verbose` (info-level findings بھی دکھائیں), `--ignore` (کچھ rules چھوڑیں)۔
Exit codes: `0` صاف، `1` findings ملیں، `2` usage error۔

**اصل دنیا میں کیا ملا۔** ہم نے سب سے زیادہ stars والے 9 skill repositories (115 skills) پر یہ چلایا۔ warning level یا اس سے اوپر کوئی security finding نہیں ملی — یہ اچھی خبر ہے۔ البتہ 2 spec errors ملیں (ایک description جو 1,024-character کی حد سے زیادہ تھی، اور ایک نام جو اس کے folder سے match نہیں کرتا) اور 31 warnings — زیادہ تر bodies جو 500-line کی ہدایت سے بڑے تھے، all-caps "چیخنا"، اور descriptions جو یہ نہیں بتاتے کہ skill کب استعمال کریں۔ اگر آپ وہ تمام 115 skills install کریں تو وہ مل کر ہر session میں ≈7.8k tokens کا اضافہ کریں گی۔

## یہ skills کیسے لکھی گئی ہیں

موجودہ models ہدایات کو بغور مانتے ہیں، اس لیے prompting کی پرانی عادتیں الٹا اثر کرتی ہیں۔
یہاں ہر skill انہی اصولوں پر چلتی ہے، اور [`vet`](#vet-check-any-skill-before-you-trust-it)
میکانیکی اصولوں کی جانچ کرتا ہے:

- **وجہ ایک بار بتائیں۔** وجہ کے ساتھ دیا گیا اصول ان cases پر بھی لاگو ہوتا ہے جو اصول میں نہیں تھے۔ وہی اصول capitals میں دہرانے سے model اسے ضرورت سے زیادہ لاگو کرتا ہے۔
- **مختصر رکھیں۔** ہر skill body 460–560 tokens۔ یہاں کچھ بھی `references/` کا محتاج نہیں۔
- **Description ہی trigger ہے۔** یہ بتاتا ہے کہ skill کیا کرتی ہے، پھر کب استعمال ہوتی ہے — تیسرے شخص میں، 1,024 characters سے کم۔
- **Portable۔** Frontmatter کھلی spec کے اندر رہتا ہے، سوائے `grill` پر `argument-hint` کے۔ خالص Markdown، کوئی hooks نہیں، کوئی scripts نہیں، چلانے کے لیے کچھ نہیں۔
- **قابلِ پیمائش۔** بغیر eval کے کوئی skill نہیں، اور کوئی eval grader ایسا نہیں جو صرف تب pass ہو جب skill چلی ہو: "skill چلی" کی جانچ رپورٹ ہوتی ہے لیکن score میں شامل نہیں ہوتی۔

مزید [docs/writing-skills.md](docs/writing-skills.md) میں۔

## شراکت

سب سے مفید contributions، ترتیب کے ساتھ:

1. **ایک eval case** جو کسی skill کو *پاس کرنا چاہیے* لیکن نہیں کرتی، یا ایک case جہاں skill چیزیں بگاڑ دیتی ہے۔ اسی طرح skills ٹھیک ہوتی ہیں یا نکالی جاتی ہیں۔
2. **ایک نئی skill** اپنے eval suite کے ساتھ۔ [CONTRIBUTING.md](CONTRIBUTING.md) دیکھیں: skill تب قبول ہوتی ہے جب موجودہ models پر مثبت Δ ظاہر ہو، اس سے پہلے نہیں۔
3. **ایک `vet` rule**، یا کوئی false positive جو آپ کو کسی اصل skill پر ملا۔

اچھے پہلے issues یہاں ملیں گے:
[`good first issue`](https://github.com/Xnadir/vetted/labels/good%20first%20issue)۔

## ماخذ اور شکریہ

یہ skills ان خیالات کی نئی تحریر ہیں جو community نے مشہور کیے، کوئی نقل نہیں: obra کے
[superpowers](https://github.com/obra/superpowers) (تصدیق، منظم debugging)، Forrest
Chang کی [Karpathy guidelines](https://github.com/forrestchang/andrej-karpathy-skills)
(surgical تبدیلیاں)، [ponytail](https://github.com/DietrichGebert/ponytail) (dependencies سے پہلے stdlib)، [i-have-adhd](https://github.com/ayghri/i-have-adhd) (پہلے جواب)، Matt
Pocock کی [skills](https://github.com/mattpocock/skills) (grilling، handoffs)، اور Addy Osmani کی
[agent-skills](https://github.com/addyosmani/agent-skills)۔ Eval format Anthropic کا
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals) ہے، اور skill format کھلی
[Agent Skills](https://agentskills.io) spec ہے۔

## لائسنس

[MIT](LICENSE)
