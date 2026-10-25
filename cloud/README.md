# BOKRA في سحابة Claude

Claude بيشتغل على BOKRA من سحابة Anthropic، والكمبيوتر مقفول. مفيش API بيتدفع، التشغيل بيتحسب من اشتراك Claude.
الداتا والمزامنة على Supabase. Claude هنا هو «المخ»: بيسمع التسجيلات، ويحط كل حاجة في مكانها، ويكتب المراجعات.

## الأجزاء

| الجزء | فين | بيعمل إيه |
|---|---|---|
| `tools/bokra.py` (لما `BOKRA_CLOUD=1`) | الريبو ده | مفيش login. مفتاح Supabase بيضيفه الـproxy، وتحويل الصوت لكلام بـElevenLabs |
| `cloud/brain.sql` | Supabase ← SQL Editor | أول ما تنزل ملاحظة جديدة في «دماغي»، بيصحّي Claude على طول (API trigger) |
| `cloud/tasks/*.md` | Scheduled tasks على claude.ai | النص اللي كل مهمة بتشتغل بيه |
| skill `bokra-review` | الـsetup script بتاع الـenvironment (**مش في الريبو**) | فيها «العهد»، فبتتحط في مكان محدش يشوفه غيره |

## الـCloud environment («BOKRA»)

- **Environment variables:** `BOKRA_CLOUD=1`، و`BOKRA_USER_ID=<id بتاعه في Supabase>`، و`TZ=Africa/Cairo`.
- **Network secrets.** كل secret من دول بيتضاف للطلب وهو خارج، والـsession نفسها مبتشوفهوش:
  - `mjadsoyufdddbqezgrcy.supabase.co`: header `apikey` من غير prefix، وقيمته الـ**Secret key** بتاعة المشروع (Supabase ← Project Settings ← API Keys).
  - `api.elevenlabs.io`: header `xi-api-key` من غير prefix، وقيمته مفتاح ElevenLabs.
- **Setup script:** بيكتب الـskill في `~/.claude/skills/bokra-review/`. بيتعمل من `make_setup.py` اللي على الكمبيوتر بتاعه، برّه الريبو.

## المهام

| المهمة | التشغيل | النص |
|---|---|---|
| BOKRA · Inbox | API (من Supabase)، ومرة كل 3 ساعات احتياطي | `tasks/inbox.md` |
| BOKRA · Morning | كل يوم 14:30 بتوقيت القاهرة | `tasks/morning.md` |
| BOKRA · Night | كل يوم 04:00 | `tasks/night.md` |
| BOKRA · Weekly | الجمعة 23:30 | `tasks/weekly.md` |

## حاجات تعرفها

- «فوري» يعني دقيقة أو اتنين، لأن كل مرة بتفتح session جديدة.
- القفل (`bokra_brain`) بيمنع إن تشغيلتين يعالجوا نفس الملاحظة. لو تشغيلة ماتت، القفل بيتفك لوحده بعد 20 دقيقة.
- لو حد الاستخدام بتاع اشتراك Claude خلص، التشغيلات بتقف لحد ما يتجدد، والملاحظات بتفضل مستنية لحد ساعتها.
