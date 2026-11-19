#pragma once
#include <stdint.h>
// Called under the helper's critical section. Unsigned subtraction handles millis wrap.
struct DeviceOutputLease {
  int64_t version = -1;
  bool requested = false;
  uint32_t receivedAt = 0, duration = 0;
  constexpr bool accept(int64_t next, bool on, uint32_t remaining, uint32_t now) {
    if (next < version || !remaining || remaining > 10000) return false;
    version = next; requested = on; duration = remaining; receivedAt = now;
    return true;
  }
  constexpr bool desired(uint32_t now) const {
    return duration && uint32_t(now - receivedAt) < duration && requested;
  }
};
