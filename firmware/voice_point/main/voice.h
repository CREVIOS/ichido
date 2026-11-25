#pragma once
#include <stdbool.h>

// The case's LiveKit room: publish the microphone, play what the agent says.
bool voice_join(const char *url, const char *token);
void voice_leave(void);
bool voice_in_room(void);    // a room exists (connecting or connected)
bool voice_connected(void);  // connected now
bool voice_ended(void);      // the connection failed or closed: leave, then ask for a new grant
