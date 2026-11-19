// Compile-time execution of the actual sketch's debounce logic using Arduino
// API declarations supplied by the software verification command.
#include "../esp32_firmware/Manual_Open_Close_Button_Test/Manual_Open_Close_Button_Test.ino"

constexpr bool pressAndRelease() {
  DebouncedInput input;
  input.initialize(true, 0);
  if (input.update(false, 10)) return false;
  if (input.update(false, 39)) return false;
  if (!input.update(false, 40) || input.stableHigh) return false;
  if (input.update(false, 100)) return false;
  if (input.update(true, 110)) return false;
  if (input.update(true, 139)) return false;
  return input.update(true, 140) && input.stableHigh;
}

constexpr bool bouncingPress() {
  DebouncedInput input;
  input.initialize(true, 0);
  if (input.update(false, 10)) return false;
  if (input.update(true, 15)) return false;
  if (input.update(false, 20)) return false;
  if (input.update(true, 25)) return false;
  if (input.update(false, 30)) return false;
  if (input.update(false, 59)) return false;
  return input.update(false, 60) && !input.stableHigh && !input.update(false, 61);
}

constexpr bool independentAndSimultaneous() {
  DebouncedInput open, close;
  open.initialize(true, 0);
  close.initialize(true, 0);
  open.update(false, 10);
  close.update(false, 15);
  if (!open.update(false, 40) || !close.stableHigh) return false;
  if (!close.update(false, 45) || open.stableHigh || close.stableHigh) return false;
  close.update(true, 50);
  return close.update(true, 80) && close.stableHigh && !open.stableHigh;
}

constexpr bool wraparoundAndHeldAtBoot() {
  DebouncedInput input;
  input.initialize(false, 0xfffffff0u);
  if (input.stableHigh || input.update(false, 0xfffffff1u)) return false;
  input.update(true, 0xfffffff8u);
  if (input.update(true, 21u)) return false;
  return input.update(true, 22u) && input.stableHigh;
}

static_assert(OPEN_BUTTON_PIN == 25 && CLOSE_BUTTON_PIN == 32);
static_assert(DEBOUNCE_MS == 30);
static_assert(pressAndRelease(), "Press/release timing or held-state regression");
static_assert(bouncingPress(), "Bounce should produce one stable edge");
static_assert(independentAndSimultaneous(), "Inputs must debounce independently");
static_assert(wraparoundAndHeldAtBoot(), "Boot-held and timer-wrap behavior");
