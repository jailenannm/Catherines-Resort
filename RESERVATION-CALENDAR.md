# Reservation calendar and availability boundary

## Implemented behavior

Step1 now has a native-button calendar below Check-in Date and Stay Duration & Slot, with two months on desktop and one on mobile. Previous/Next browse months without changing the selected date. Picking a day updates the existing date field, booking overview and draft; editing the field updates the calendar month/highlight. Past days respect the existing date field minimum. Date buttons have full spoken dates, selected state and visible keyboard focus.

The homepage button is now **Check Availability**. Its existing `pendingReservation` prefill carries date, canonical slot, facility and guest selection through the existing signed-in/sign-out return flow. An explicit homepage facility replaces the default cottage selection instead of silently adding it. Guest ranges such as `11–30 Guests` remain a tab-scoped preference displayed above the counters; they are not truncated to four guests or silently treated as eleven. Guests review/set their exact adults/children/seniors in Step1; only exact saved counts enter the reservation record. Existing fresh-homepage-versus-draft precedence is retained.

Removed the hard-coded Ocean Climate, high-tide/sunset and Surf Conditions widgets. The keycard block now says **RFID Assignment Pending** and explains administrator assignment after confirmation; live RFID check-in and guest device control are not enabled.

## Availability audit: missing dependency

The checkout contains booking ownership/status/price/package rules and `BookingSlots` labels, but **no trusted shared availability feed, capacity allocation model or overlap policy**. Guests cannot list other guests' private bookings, and local demo history is not an availability source. This work does not invent capacities or infer availability from private or local records. No database rules were changed.

Default behavior without a configured source: dates remain selectable, availability says **Couldn’t verify availability**, and the existing pending-reservation request flow remains available with an explicit warning that the resort must confirm availability. This preserves the current Pending Verification submission behavior; it does **not** claim availability is confirmed. No browsing action creates a booking, slot hold, email or device command.

If a trusted source is configured, the calendar checks the current facility combination and stay slot, refreshes on their changes, and performs a fresh check for the exact immutable submission snapshot before saving. A verified unavailable result blocks that submission and keeps the form available. Existing uncertain attempts are recovered by owner/attempt/reference from the shared store before availability is rechecked, so a committed booking cannot be duplicated or blocked merely because its slot is subsequently reported occupied. An uncertain attempt is not discarded based on a later unavailable result.

Fresh availability is advisory; it is not an atomic slot reservation. Actual resource capacity/overlap enforcement at booking time still needs a trusted backend and policy. Pending bookings, approval, RFID and check-in rules/prices/taxes are unchanged.

## Prepared read-only source contract

No endpoint is enabled by default. To integrate a real source later, supply a trusted same-origin API path in `SHARED_RESERVATIONS_CONFIG.availabilityEndpoint` (must start `/api/`). The calendar sends an authenticated **GET** containing only `from`, `to`, `date`, `slotId` and sorted comma-separated facility IDs. It never sends a guest name/contact or writes holds. The API must verify the named reservation app's Firebase bearer token and return aggregate availability without exposing guest records.

Expected response, demonstrated **only by emulator test fixtures**:

```json
{
  "slotId": "day-retreat",
  "facilities": ["pool"],
  "verifiedAt": 1800000000000,
  "source": "Trusted resort availability service",
  "days": {"2027-04-15": "available", "2027-04-16": "unavailable"}
}
```

`verifiedAt` must be the actual server verification time, not the illustrative timestamp above; future or older-than60-second snapshots are rejected. Facilities and slot must exactly match the request, dates/statuses must be valid, and the selected day must be present. Network failures, missing source, malformed responses and stale data clear verified date markings and show Couldn’t verify availability. Cached markings expire automatically. This contract is not a deployed service or permission change.

Before a live availability guarantee, decide resource inventory/capacity, cottage quantities, Event's bundled Pool sharing, buyout exclusivity, date/slot overlap including the next-day22-hour slot, blocking statuses, time zone and holds/concurrency policy; implement server-side atomic enforcement accordingly.

## Verification

The new emulator test exercises homepage date/slot/Pool prefill and guest-range preference; date/calendar/overview synchronization; month browsing; two/one-month layout; verified unavailable days; failed, stale, no-source and no-facility lookups; facility/slot changes including Event/Pool normalization; submission-time recheck; and exactly one pending save with preserved Pool total1546 and empty RFID. Availability data in that test is explicitly synthetic. The shared Phase2A.2 suite also passed all11 groups, including validation, repeated clicks, failed saves, uncertain-save retry identity, owner/admin matching references and unauthorized reads/writes.

Repeat with the existing Node/Java/Chrome emulator toolchain:

```powershell
& .\node_modules\.bin\firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json 'node --require ./tests/isolated-facility-ports.cjs tests/public-guest-regression.cjs reservation-calendar phase2a2'
```

Tests use private emulator ports19099/19000 and web15000, leaving the existing5000 preview intact. Desktop/mobile screenshots are under `test-results/calendar-*.png`. No live Firebase, real email or hardware command was used. Live availability remains pending the source/policy above.

## Changed files / preview

- `index.html`: homepage button label.
- `reservation.html`, `css/reservation.css`: calendar/feedback, range note, realistic keycard message and removal of sample readings.
- `js/reservation-calendar.js`: new read-only calendar/source adapter.
- `js/reservation.js`: homepage prefill fixes and snapshot-based pre-save recheck.
- `js/shared-reservations.js`: recover an already committed owned attempt before rechecking availability.
- `tests/serve.cjs`: allow only the calendar UI script in reservation-only mode; device restrictions retained.
- `tests/reservation-calendar.test.cjs`, `tests/isolated-facility-ports.cjs`: emulator verification/private-port routing.
- `RESERVATION-CALENDAR.md`: this report.

Use `http://127.0.0.1:5000/index.html` with the existing emulator preview, select homepage choices, then Check Availability. Port5000 needs a hard refresh. Restart any running port5001 cloud-test server to load the new presentation-script allowlist, then hard refresh; a newly started server already has it. No Firebase deployment, rule publication, firmware or hardware changes are required/performed.
