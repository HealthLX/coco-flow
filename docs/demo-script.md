# CoCo Flow — Demo Script (non-technical audience)

**Runtime:** ~20 minutes for the core demo, ~30 with questions.
**Audience:** someone who understands healthcare/insurance as a business, but not XML, schemas, or FHIR.
**Goal they should leave with:** *"CoCo is a shared blueprint for health data, and Flow is the machine that proves the blueprint actually works."*

---

## 0. Before you start (5 minutes of prep, do not skip)

| Check | Why it matters |
|---|---|
| Open <https://flow.cocodata.org/> and confirm the sidebar dot next to **CoCo Server** is **green** | Red = backend is down and the demo is dead. |
| Do one full **Roster** run end-to-end, including **Validate FHIR**, ~10 min before you present | The FHIR validator is a public service that takes **30–50 seconds to wake up** on a cold session. Warming it up first turns a painful silence into a sub-second result on stage. |
| Set the app to **light theme** if projecting, dark if screen-sharing | Sidebar → theme toggle at the bottom. |
| Collapse anything distracting; full-screen the browser | |
| Have a backup: `npm run dev:proto` runs the whole app from checked-in sample files with **no backend at all** | If the venue wifi dies or the API is down, you can still run the entire demo. A yellow "Fixture mode" banner appears — just say "I'm running from a saved recording." |

**Know your escape hatch:** if any single step fails live, move on. Every step's output already exists as a checked-in file in the `coco-canonical` repo — you can show the finished artifact instead of generating it.

---

## 1. The problem (2 min — no screen, just talk)

> "Before I show you anything, let me set up the problem this solves.
>
> Say you're a health plan. The government — CMS — now requires you to hand your members' data to whoever they ask you to hand it to. Their new doctor. A health app on their phone. Another insurer they're switching to. The rules are called CMS-9115 and CMS-0057, and you don't need to remember the numbers.
>
> Here's the catch. The regulation tells you **what** has to happen. It does not tell you **how**. And every health plan in the country stores its data differently — different systems, different field names, different decades of technology stacked on top of each other. One plan calls it `MBR_DOB`. Another calls it `birthDt`. A third has it buried in a mainframe field with no name at all.
>
> So you get this" — *hold up your hands and draw the mess in the air* — "fifty plans, each building a one-off translation for every partner they exchange data with. It's expensive, it's slow, and nobody can prove theirs is right.
>
> CoCo is the fix. And CoCo Flow is how you see it working."

---

## 2. What a canonical schema is, and why (3 min)

**Navigate:** Overview page (the landing page).

> "This is CoCo Flow. On this page you can see the five things at the centre of all of this."

*Point at the schema cards: **Roster**, **EOB**, **Formulary**, **Provider Directory**, **Clinical**.*

> "Those five are the **canonical schemas**. Let me explain that term, because it's doing all the work.
>
> **'Canonical'** just means *the agreed-upon one*. The official version. Not your version and not my version — the one we both point at.
>
> **'Schema'** means *a blueprint that says what a valid record looks like*. Not the data itself — the shape of it. Think of a mortgage application form: it says there's a field for your name, a field for your income, income has to be a number, this section is required and this one is optional. The form is the schema. What you write on it is the data.
>
> So a **canonical schema** is one agreed blueprint for a kind of health information."

*Read the five off the screen, in plain English:*

- **Roster** — who the members are. Names, birthdates, addresses, which plan covers them.
- **EOB** — Explanation of Benefits. The claim: what was billed, what got paid, what the member owes.
- **Formulary** — which drugs are covered, at what tier, what needs prior approval.
- **Provider Directory** — the doctors and facilities. Their credentials, specialties, locations, networks.
- **Clinical** — the medical record itself. Diagnoses, procedures, visits, lab results, allergies.

> "Between them, that covers most of what the regulation actually asks plans to exchange.
>
> **Why bother agreeing on a blueprint at all?** Because of the math. If ten organisations each invent their own format and want to exchange data, that's ninety separate translations to build and maintain. If everyone translates once, to a shared middle format, it's ten. That's the entire idea. One agreed shape in the middle, and the problem stops multiplying.
>
> And the second reason, which matters more than people expect: **a blueprint can be checked**. If the shape is written down formally, a computer can look at any file and tell you yes-this-conforms or no-here's-line-47-and-here's-what's-wrong. You'll see me do exactly that in about four minutes. You cannot do that against a Word document describing what the data 'should' look like."

**If someone asks "why XML and not something modern?"** — good question, short answer: XML schemas have a mature, universally supported way of expressing *and automatically enforcing* rules. That enforcement is the point. It's also what the FHIR world and the tooling ecosystem already speak.

---

## 3. Look at an actual blueprint (2 min)

**Navigate:** **Schema Explorer** in the sidebar → click **Roster**.

> "This is the Roster blueprint, drawn as a diagram. Every box is a field or a group of fields. You can see it has members, and each member has demographics, identifiers, addresses, coverage."

*Expand a couple of levels. Don't go deep — you're showing the shape, not reading it.*

> "Notice this isn't a vague description. It's precise. Every field has a type, a name, and rules about whether it's required and how many times it can repeat. That precision is what makes the checking possible."

**Optional, 30 seconds:** click **Schemas** in the sidebar to show the raw file underneath.

> "And underneath the diagram, it's just a text file. Which means it lives in version control like source code — every change is tracked, reviewable, and dated. When the regulation changes, you can see exactly what changed in the blueprint and when. That's the 'inspectable' part of the pitch, and for anyone in a compliance role it's the whole ballgame."

---

## 4. Synthetic data — what it is and why we make it (4 min)

**Navigate:** **Workspace** → Step 1, **Predefined** tab → select **Roster**.

> "Now the interesting part. I have a blueprint. I have zero data.
>
> And that's not laziness — it's the actual constraint everyone in this industry works under. **You cannot test with real patient data.** It's protected health information. You can't email it to a vendor, you can't put it in a test environment, you can't hand it to a partner to check their side works. In a lot of cases you can't even look at it yourself without a documented reason.
>
> So how does anyone build anything?"

*Click **Generate Sample XML**.*

> "That. CoCo just read the blueprint and invented a member who doesn't exist."

*Let the XML render. Scroll it slowly.*

> "This is **synthetic data**. Fake, but not random — it's fake **in exactly the right shape**. There's a birthdate, and it's a real date in a valid format. There's a race code, and it's a genuine code from the official code list. Addresses look like addresses. The structure is exactly what a real member record would be.
>
> Nobody's privacy is involved, because this person has never existed. But every system downstream will treat it identically to a real record. So you can send it to a vendor, put it in a test environment, hand it to a partner, run it through your pipeline a thousand times — with zero risk.
>
> Under the hood it's a library called Faker doing the invention, guided entirely by the blueprint. Which means it's not a fixed sample file that goes stale — **change the blueprint and the samples change with it, automatically.**"

> "Two things this buys you that are easy to miss:
>
> One — **partners can start building before you have a data agreement in place.** That's often months of calendar time recovered.
>
> Two — it's a test of the blueprint itself. If the generator can't produce a valid file from a schema, the schema has a bug. Every one of these runs on every proposed change, automatically."

> ⚠️ **Pre-empt the awkward moment — say this before they spot it:**
>
> *"You'll see some odd values in here — a sender ID of 'job', a code that says 'although'. That's deliberate on our part, not a bug. Where a field is free text with no fixed list of valid values, the generator drops in a nonsense word. It's a flag: it tells you instantly that you're looking at fake data, and it means nobody can mistake a test file for a real one. The fields that **do** have official code lists — race, ethnicity, gender — get genuine codes, and you can see those are correct."*

---

## 5. Validating against the blueprint (2 min)

**Click:** Step 3, **Validate against XSD**.

*Wait for the green result.*

> "That's the payoff I promised. A computer just read the blueprint, read the file, and confirmed every single field conforms — right type, right format, required fields present, nothing extra smuggled in.
>
> This takes under a second and it's completely objective. No meeting, no email thread, no 'well, we interpreted the spec differently.' It conforms or it doesn't, and when it doesn't you get the exact line and the exact reason.
>
> Now picture that check sitting in a health plan's pipeline. Every file, every partner, every day — automatically pass/fail before anything moves downstream. That's what turns 'we think we're compliant' into 'here's the evidence.'"

**Nice detail if you have time:** the **Custom XSD** tab in Step 1 lets you upload *your own* blueprint and do all of this against it. Useful if you're talking to someone who already has their own data models — the tooling isn't limited to CoCo's five.

---

## 6. FHIR and the XSLT transform (5 min — the centrepiece)

**Do not click yet.** Set it up first.

> "Okay. So we have a clean, valid canonical file. But the regulation doesn't ask health plans to publish canonical files. It asks for **FHIR**.
>
> FHIR — spelled F-H-I-R, pronounced 'fire' — stands for Fast Healthcare Interoperability Resources. It's the international standard for moving health data between systems, and CMS mandates it. When your phone's health app pulls your records from your insurer, it's FHIR on the wire.
>
> FHIR breaks health data into standard building blocks called **resources**. A **Patient** resource. A **Coverage** resource. A **Practitioner** resource. An **Observation**. Each one has a defined structure that every FHIR system on earth already understands.
>
> So there's a gap. Our canonical file is organised the way a *health plan* thinks — here's a member, here's everything about them, all in one record. FHIR is organised the way a *clinical system* thinks — here's a Patient over here, their Coverage over there, linked together by reference.
>
> Same facts. Completely different arrangement. Something has to do the rearranging."

*Now point at Step 4.*

> "That's what an **XSLT transform** is. XSLT is a language whose entire purpose is turning one structured document into a differently structured document. It's a rulebook. 'Take the birthdate from *here* in the canonical file, put it *there* in the FHIR Patient. Take these three code fields, combine them into a FHIR race extension.' Hundreds of rules like that, written once.
>
> **Why does it matter that it's a written-down rulebook rather than program code?**
>
> Because a rulebook is **readable**. If a regulator, or an auditor, or a partner asks 'where did this value in your FHIR output come from?' — you can point at the exact rule. It's a file. It's in version control. Someone who isn't a programmer can follow it.
>
> And it's **swappable**. Same canonical file, different rulebook, different output — for a different FHIR version, a different implementation guide, a different partner's quirks. You don't rewrite your systems. You swap a rulebook.
>
> That is the actual product here. The blueprint gives you one shape. The rulebooks fan it out to everywhere it needs to go."

**Now click Transform to FHIR.**

*The app jumps to the FHIR output.*

> "One canonical member record just became several FHIR resources at once."

*Point at each output tab/file: **Patient**, **Coverage**, **Observation**.*

> "One rulebook produced the Patient. Another produced their Coverage. Another produced clinical observations. Three separate standard resources, from one input, in one pass.
>
> And this is small. Roster has three rulebooks. **Clinical has twenty-six** — Patient, Encounter, Condition, Procedure, Immunization, Allergy, Medication, lab results, care plans, and so on. Drop a new rulebook in the folder and it runs. No configuration, no code change."

---

## 7. What a FHIR resource actually is (2 min)

*Scroll the Patient output slowly. Point at real lines on the screen.*

> "Let me make 'FHIR resource' concrete, because it sounds abstract and it really isn't.
>
> This is a **Patient resource**. It's a single self-contained record about one person, in a shape that every FHIR system in the world already knows how to read.
>
> Here's the ID. Here's the birthdate — the same date that was in our canonical file two minutes ago, just relocated. Here's the race information, and notice this bit —" *point at the `us-core-race` extension URL* "— that's a web address. It's pointing at the official published definition of how race is represented in US healthcare data. That's not decoration. Any system receiving this file can follow that link and know precisely what the field means, without ever talking to us.
>
> And this piece —" *point at the `<text>` / narrative div* "— is a human-readable summary baked into the record. 'Patient, male, date of birth 1984.' FHIR requires that. Every resource carries a version a person can read, not just a machine.
>
> **That's the whole idea of a resource.** Self-describing, standard, portable. Hand it to any FHIR system anywhere and it just works — because the meaning travels with the data instead of living in a spec document someone has to go read."

---

## 8. Validating the FHIR (2 min)

**Click:** Step 5, **Validate FHIR**.

> "Last check, and it's the strictest one.
>
> We've now sent these resources to **HL7's official public validator** — HL7 being the standards body that publishes FHIR. This isn't our tool marking our own homework. It's the referee.
>
> And it's not just checking 'is this valid FHIR.' It's checking against **US Core**, which is the American profile of FHIR — the extra rules CMS actually requires on top of the base standard. Every resource gets checked against its own matching profile: Patient against the US Core Patient rules, Practitioner against Practitioner, and so on."

*Show the pass/fail rows.*

> "Green means: this output would be accepted by a compliant system. That's the round trip. Blueprint, to synthetic data, to schema check, to rulebook, to FHIR, to independent verification — and every step of it is inspectable.
>
> And note — we can send this to a *public* validator without a moment's hesitation, precisely because it's synthetic. No real patient data ever goes near it. That's the synthetic-data decision from earlier paying off."

**If the validator is slow:** *"It's loading the full US Core rulebook — thousands of pages of rules — into memory. First call after it's been idle takes about a minute; after that it's instant."* Keep talking, don't stare at the spinner.

**If a warning appears about `validate-code` or `tx.fhir.org` timing out:** *"That's a warning, not a failure — a terminology lookup service being slow. It doesn't affect the result."*

---

## 9. Export, and the whole thing in one view (2 min)

**Click:** Step 6, **Export**. Download one file so they see something land.

> "Everything is downloadable at every stage. Canonical file, FHIR output — hand them to a vendor, attach them to a ticket, drop them in a test suite."

**Then navigate to Pipeline** (sidebar, marked Beta) — **or use the deep link `…/flow?canonical=roster&autorun=1` to run the whole thing automatically.**

> "And here's the same journey as a single picture. Seven stages: pick the blueprint, generate the sample, check it against the blueprint, run the rulebooks, produce FHIR, verify against US Core, export."

*Let it run. Watch the stages light up.*

> "That's the entire story on one screen. And this is exactly what runs automatically every time someone proposes a change to a blueprint — the change doesn't get merged unless the whole chain still passes. The quality gate isn't a policy document. It's a pipeline."

---

## 10. Close (1 min)

> "So, three sentences.
>
> **The canonical schemas** are one agreed blueprint for health data, so every organisation isn't inventing its own — and because the blueprint is formal, conformance can be proved rather than asserted.
>
> **The synthetic data** means you can build, test, and collaborate with partners without ever touching real patient information.
>
> **The transforms** turn that one canonical shape into FHIR — the standard the regulation actually requires — through readable, swappable rulebooks that an auditor can follow.
>
> And all of it is open source. The blueprints, the rulebooks, the tooling. Anyone can read it, run it, and check our work. In a compliance context, that's not a nice-to-have — it's the point."

---

## Likely questions, and answers

**"Is this replacing our claims system / our adjudication logic?"**
No — explicitly not. CoCo doesn't decide anything. It doesn't approve claims or make coverage determinations. It standardises how data is *shaped and exchanged*, and proves that shape is correct. Your business logic stays exactly where it is.

**"Is the data real?"**
Never. Every record you saw was invented from the blueprint. That's a deliberate design decision, not a limitation of the demo.

**"Where does our actual data come in?"**
You map your systems' output to the canonical shape once. From there, everything you just watched — validation, transforms, FHIR, verification — applies to your real data automatically.

**"Who maintains this?"**
It's an open-source project stewarded by HealthLX, evolving with the CMS regulations and with community contributions. Everything is versioned and traceable back to the regulatory source.

**"Does this make us compliant?"**
It makes compliance *demonstrable* for the data-exchange piece — you can show the artifacts and the checks. It doesn't certify that your business decisions underneath are correct; nothing can.

**"Can we use our own schemas instead of these five?"**
Yes — the **Custom XSD** tab takes your own blueprint and runs the same generate/validate/transform flow against it.

**"How is this different from just buying an integration engine?"**
An engine moves and translates data. It doesn't give you an industry-agreed target shape, or published rulebooks an auditor can read, or an automated proof that your output matches the standard. This is the layer above the plumbing.

---

## Glossary — say the left, never the right

| Say this | Not this |
|---|---|
| blueprint / agreed shape | XSD, XML Schema |
| a made-up record with a real shape | synthetic data instance |
| rulebook for rearranging data | XSLT stylesheet |
| the international standard for exchanging health data | FHIR R4 |
| a standard building block — a Patient, a Coverage | FHIR resource |
| the American rules on top of the standard | US Core Implementation Guide |
| checked it against the blueprint | schema validation |
| the referee's check | validator conformance run |

---

## Things that go wrong, and what to do

| Symptom | Do this |
|---|---|
| **CoCo Server** dot is red | Stop. Restart the backend, or fall back to `npm run dev:proto` (fixture mode). |
| Validate FHIR hangs 30–60s | Keep talking — explain it's loading US Core. This is why you warm it up beforehand. |
| Transform returns a 400 | You're on a stale build. Use a different canonical, or show the checked-in FHIR sample files instead. |
| Someone fixates on a weird generated value | Use the pre-emption in §4. Own it as a deliberate design choice — because it is one. |
| You're running long | Cut §3 (Schema Explorer) and §9 (Pipeline). §4, §6, and §7 are the load-bearing ones — never cut those. |

---

## The 3-minute version, if that's all you get

1. **Overview page** — "Five agreed blueprints for health data, so fifty organisations aren't inventing fifty formats."
2. **Workspace → Roster → Generate** — "Fake member, real shape. No privacy risk, so you can actually build and test with it."
3. **Validate against XSD** — "Proved it conforms. Objectively, in under a second."
4. **Transform to FHIR** — "A readable rulebook rearranged it into FHIR, the standard CMS requires. One input, several standard resources."
5. **Validate FHIR** — "And HL7's own validator confirms it. Not us marking our own homework."

> "Blueprint, safe test data, standard output, independent proof. All open source."
