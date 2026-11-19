'use strict';
// Compile the exact sketch against API doubles, never the private reader config.
// This checks C++ syntax and conditional compilation, not ESP32 library linkage.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
(async () => {
    const compiler = process.env.ESP32_TEST_CXX || path.join(process.env.LOCALAPPDATA, 'Arduino15/packages/esp32/tools/esp-x32/2601/bin/xtensa-esp32-elf-g++.exe');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'rfid-sketch-test-'));
    const stub = `#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
class String { public: String(){} template<class T> String(T){} template<class T> String operator+(T) const {return String();} int indexOf(const char*)const{return 0;} const char* c_str()const{return "";} size_t length()const{return 0;} };
struct SerialType {void begin(int){} template<class T>void print(T){} template<class T>void println(T){} void println(){} }; extern SerialType Serial;
unsigned long millis(); void delay(unsigned long);
constexpr int WIFI_STA=1, WL_CONNECTED=3, MBEDTLS_MD_SHA256=1;
struct WifiType {void mode(int){} void setAutoReconnect(bool){} void disconnect(){} void begin(const char*,const char*){} int status(){return 0;} String localIP(){return String();}}; extern WifiType WiFi;
struct SpiType {void begin(int,int,int,int){}}; extern SpiType SPI;
class MFRC522 {public: struct {uint8_t uidByte[10]; uint8_t size;}uid; MFRC522(int,int){} void PCD_Init(){} bool PICC_IsNewCardPresent(){return false;} bool PICC_ReadCardSerial(){return false;} void PICC_HaltA(){} void PCD_StopCrypto1(){} };
class WiFiClient {};
class HTTPClient {public: void setTimeout(int){} bool begin(WiFiClient&,String){return true;} int GET(){return 200;} String getString(){return String();} void end(){} void addHeader(const char*,const char*){} int POST(String){return 200;} };
const void* mbedtls_md_info_from_type(int); int mbedtls_md_hmac(const void*,const unsigned char*,size_t,const unsigned char*,size_t,unsigned char*);
uint32_t esp_random(); int esp_reset_reason();
`;
    await fs.writeFile(path.join(temporary, 'test-api.h'), stub);
    await fs.mkdir(path.join(temporary, 'mbedtls'));
    for (const header of ['SPI.h', 'MFRC522.h', 'WiFi.h', 'HTTPClient.h', 'mbedtls/md.h', 'esp_system.h']) await fs.writeFile(path.join(temporary, header), '#include "test-api.h"\n');
    await fs.copyFile('esp32_firmware/RFID_WiFi_Bench/UidFormatter.h', path.join(temporary, 'UidFormatter.h'));
    const sketch = await fs.readFile('esp32_firmware/RFID_WiFi_Bench/RFID_WiFi_Bench.ino', 'utf8');
    await fs.writeFile(path.join(temporary, 'sketch.cpp'), sketch);
    for (const mode of [0, 1]) {
        await fs.writeFile(path.join(temporary, 'bench-secrets.h'), `#define BENCH_DIAGNOSTICS_ONLY ${mode}\n#define BENCH_SERVER "http://127.0.0.1:8787"\n#define BENCH_READER_ID "esp1-bench"\n#define BENCH_READER_KEY "fake-test-key-never-a-real-credential"\n#define BENCH_WIFI_SSID "test"\n#define BENCH_WIFI_PASSWORD "test"\n`);
        const args = ['-std=c++17', '-I', temporary, '-x', 'c++', path.join(temporary, 'sketch.cpp')];
        execFileSync(compiler, ['-fsyntax-only', ...args], { stdio: 'pipe' });
        const code = execFileSync(compiler, ['-E', ...args], { encoding: 'utf8' });
        assert.equal(code.includes('void sendScan('), mode === 0);
        assert.equal(code.includes('String(BENCH_SERVER) + "/scan"'), false); // macros expand URL
        assert.equal(code.includes('+ "/scan"'), mode === 0);
        assert(code.includes('+ "/diagnostic"'));
    }
    assert.match(sketch, /MAX_WIFI_ATTEMPTS = 3/);
    assert.match(sketch, /WIFI_CONNECT_WINDOW_MS = 15000/);
    assert.match(sketch, /WIFI_RETRY_DELAY_MS = 30000/);
    console.log('PASS: exact sketch C++ syntax in both modes using API doubles; diagnostic build excludes sendScan and /scan HTTP path; normal signed scan retained; bounded reconnect constants present. Full Arduino Verify and physical behavior Pending.');
})().catch(error => { console.error(error.message); if (error.stderr) console.error(error.stderr.toString()); process.exitCode = 1; });
