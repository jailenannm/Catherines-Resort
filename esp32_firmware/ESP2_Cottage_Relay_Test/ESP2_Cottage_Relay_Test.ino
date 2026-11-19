// Isolated GPIO26 diagnostic. No Wi-Fi, Firebase, servos or other output pins.
constexpr uint8_t RELAY_PIN = 26;
bool isolated = false, driven = false;
int lastLevel = LOW;
char command[32]; size_t used = 0; bool overflow = false;
void help() {
  Serial.println("UNKNOWN POLARITY: isolate LED/load power before testing.");
  Serial.println("Reset/floating input and the first driven level can activate the relay.");
  Serial.println("Commands: ISOLATED (acknowledge isolated loads), LOW, HIGH, STATUS, HELP.");
}
void status() {
  Serial.print("GPIO26 command: ");
  Serial.println(driven ? (lastLevel == LOW ? "LOW" : "HIGH") : "INPUT / not driven");
  Serial.println("Electrical command only; observe relay contacts/LEDs to verify physical behavior.");
}
void execute() {
  command[used] = 0;
  if (!strcmp(command,"HELP")) help();
  else if (!strcmp(command,"STATUS")) status();
  else if (!strcmp(command,"ISOLATED")) { isolated = true; Serial.println("Isolation acknowledged. LOW or HIGH explicitly drives GPIO26."); }
  else if (!strcmp(command,"LOW") || !strcmp(command,"HIGH")) {
    if (!isolated) { Serial.println("REFUSED: isolate loads, then type ISOLATED first."); return; }
    lastLevel = !strcmp(command,"LOW") ? LOW : HIGH;
    digitalWrite(RELAY_PIN,lastLevel); // Preload before enabling the output driver.
    pinMode(RELAY_PIN,OUTPUT);
    driven = true; status();
  } else if (used) Serial.println("Unknown command. Type HELP.");
}
void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN,INPUT); // High impedance is NOT a guaranteed OFF state.
  help(); status();
}
void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      if (overflow) Serial.println("Command too long; ignored."); else execute();
      used = 0; overflow = false;
    } else if (used < sizeof(command)-1 && !overflow) command[used++] = c;
    else overflow = true;
  }
  delay(1);
}
