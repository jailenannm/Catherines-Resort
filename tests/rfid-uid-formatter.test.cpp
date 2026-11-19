#include "../esp32_firmware/RFID_Serial_Test/UidFormatter.h"

template<size_t N, size_t M>
constexpr bool matches(const uint8_t (&bytes)[N], const char (&expected)[M]) {
  char output[21] = {};
  if (!formatUid(bytes, N, output, sizeof(output)) || M != N * 2 + 1) return false;
  for (size_t i = 0; i < M; ++i) if (output[i] != expected[i]) return false;
  return true;
}
constexpr uint8_t four[] = {0x00, 0x01, 0xA2, 0x0F};
constexpr uint8_t seven[] = {0x00, 0x04, 0x0A, 0xB0, 0x01, 0x00, 0xFF};
constexpr uint8_t ten[] = {0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09};
static_assert(matches(four, "0001A20F"), "4-byte UID must preserve zero nibbles");
static_assert(matches(seven, "00040AB00100FF"), "7-byte UID must preserve zero bytes");
static_assert(matches(ten, "00010203040506070809"), "10-byte UID must preserve every byte");
constexpr bool rejectsInvalid() {
  char output[21] = {};
  return !formatUid(four, 3, output, sizeof(output)) &&
         !formatUid(four, 4, output, 8) && !formatUid(nullptr, 4, output, sizeof(output));
}
static_assert(rejectsInvalid(), "Reject unsupported count/null input/undersized buffer");
