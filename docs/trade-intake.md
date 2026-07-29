# Tradease — Per-Trade Intake Fields (trade-intake.md)

> The structured questions a customer answers when posting a job, per trade.
> Goal: give a contractor enough to know if they can do the job and roughly price it —
> WITHOUT a blank description box.
>
> THIS IS A STARTER. Joe: HVAC and electrical are your trades — edit those to match
> what you'd actually want to know before a call. Add the trades you're missing using
> the same pattern. Claude Code reads this file to build the dropdowns; it does not
> invent fields.
>
> Format: each field is a dropdown (single choice unless marked "multi").
> "unknown" is always an allowed option — customers often don't know.

---

## Shared fields (every trade)
- **Property type:** house / condo / apartment / commercial
- **Urgency:** emergency (today) / this week / flexible
- **Who's on site:** owner present / tenant present / lockbox / nobody (needs arrangement)
- **Photos:** minimum 3 required

## Access details (every trade — required)
- Gate / building code (text, optional)
- Pets on site: yes / no
- Parking: driveway / street / none
- Who lets the contractor in: (text)

---

## HVAC  *(Joe — your trade, edit freely)*
- **System type:** central AC / heat pump / furnace / boiler / ductless mini-split / window unit / unknown
- **Fuel:** electric / gas / oil / unknown
- **Problem:** not cooling / not heating / no power / leaking / strange noise / smell / routine tune-up / new install / unknown
- **Unit location:** attic / basement / roof / closet / outside / crawlspace / unknown
- **Approx. age:** under 5 yrs / 5–10 / 10–15 / 15+ / unknown

## Electrical  *(Joe — your trade, edit freely)*
- **Job type:** outlet / switch / panel or breaker / lighting / wiring / EV charger / generator / troubleshoot / unknown
- **Symptom:** no power / breaker tripping / flickering / burning smell / partial outage / new install / unknown
- **Panel accessible:** yes / no / unknown
- **Property age (matters for old wiring):** pre-1970 / 1970–2000 / post-2000 / unknown

## Plumbing
- **Job type:** leak / clog / fixture install or replace / water heater / no water / sewer or drain / repipe / unknown
- **Location:** kitchen / bathroom / basement / outside / whole house / unknown
- **Water heater (if relevant):** tank / tankless / gas / electric / n/a
- **Can water be shut off:** yes / no / unknown

## Painting
- **Interior or exterior:** interior / exterior / both
- **Area:** 1 room / 2–3 rooms / 4+ rooms / whole home / specific sq ft (text)
- **Surfaces (multi):** walls / ceilings / trim / cabinets / doors
- **Prep needed:** patching / priming / heavy prep / none / unknown

## Roofing
- **Job type:** leak repair / full replacement / inspection / gutters / flashing / unknown
- **Roof type:** asphalt shingle / metal / flat / tile / unknown
- **Stories:** 1 / 2 / 3+
- **Known issue:** active leak / missing shingles / storm damage / age / unknown

## General / Handyman
- **Job type (multi):** mounting / assembly / drywall patch / door or lock / small carpentry / caulking / other (text)
- **Rough size:** under 1 hr / half day / full day / unknown

---

## To add a new trade, copy this pattern:
```
## <Trade name>
- **<field label>:** option / option / option / unknown
- **<field label>:** option / option / option / unknown
(3–5 fields max — enough to price it, not a survey)
```

Keep it short. Too many questions and customers abandon the post. 3–5 structured
fields per trade plus the shared ones is the sweet spot.
