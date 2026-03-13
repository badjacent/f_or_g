# UI Design Principles for Subway Decision Support

These principles apply across all subway decision scenarios, not just F-or-G.

---

## 1. Decision support, not just decisions

The app recommends, but the rider decides. Show the underlying data — key timestamps, transfer times, arrival times — so the rider can verify the logic and override if their gut says otherwise. Simplify *presentation*, not *information content*.

## 2. Hero → urgency → rationale → evidence

Every scenario screen should follow this visual hierarchy:

1. **Hero**: the recommendation (giant letter/symbol)
2. **Urgency**: HURRY or similar, directly attached to the hero if applicable
3. **Rationale**: one-line summary explaining why ("F is 4 min faster")
4. **Evidence**: the timeline data for each candidate, winner first

The rider who glances gets the hero. The rider who looks for 3 seconds gets the rationale. The rider who wants to verify gets the evidence. No scrolling required for steps 1–3.

## 3. Each candidate tells a complete journey story

Don't show isolated data points (a clock time here, a duration there). Each candidate should show the **sequence of events** the rider will experience: arrival at decision point → board the transfer → arrive at destination. This is what the rider is actually choosing between — not numbers, but journeys.

## 4. Winner is visually promoted, loser is present but recedes

Both candidates must be visible (decision support requires comparison). But the winner should be visually prominent (bold times, white background) while the loser is dimmed. The rider's eye should land on the winner first, then optionally scan the alternative.

## 5. Urgency is part of the recommendation, not an afterthought

If the recommendation depends on a tight transfer, the urgency cue must be spatially and visually attached to the hero element. It modifies the recommendation ("take the F, and hurry") — it is not supplementary information to be placed below the evidence.

## 6. Anchor context belongs inside each candidate, not as a separate element

The A/C train arrival is not a third option — it's the starting condition for each candidate's journey. Show it as the first step in each candidate's timeline rather than as a standalone column or card. This prevents the rider from perceiving it as something to choose.

## 7. Clock times over durations for real-time decisions

When the rider is underground and acting now, "Board F at 7:51" is more actionable than "wait 3 min." Clock times anchor to reality; durations require mental math from "now." Show total duration as secondary context, not primary.

## 8. Tone matches stakes

The emotional register should match the actual consequence of a wrong decision. For subway transfers, the downside is a few extra minutes — the tone should be urgent but amused, not panicked. This applies to both copy and visual design.
