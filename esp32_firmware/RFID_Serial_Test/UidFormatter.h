#pragma once
#include <stddef.h>
#include <stdint.h>

// Shared by the Serial sketch and compile-time software tests. Never infer bytes.
constexpr bool formatUid(const uint8_t* bytes, size_t count, char* output, size_t capacity) {
  if (!bytes || !output || (count != 4 && count != 7 && count != 10) || capacity < count * 2 + 1) return false;
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < count; ++i) {
    output[i * 2] = hex[bytes[i] >> 4];
    output[i * 2 + 1] = hex[bytes[i] & 0x0F];
  }
  output[count * 2] = '\0';
  return true;
}
