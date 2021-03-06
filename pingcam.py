# Ping the webcam so it fixes its delay
# Requires obs-websocket v4.3.0 or newer.
import json
import time

# TODO: Reimplement the essential parts (mainly the handshake) and
# drop the rest. This is a way bigger import than we need.
import websocket # ImportError? Try: pip install websocket-client

# TODO: Parameterize
server = "localhost"
password = ""

while True:
	try:
		ws = websocket.create_connection("ws://" + server + ":4444/")
		break
	except ConnectionRefusedError:
		time.sleep(10) # Retry till OBS is fully up
sources = ["Webcam", "Cards cam"]
for source in sources:
	data = {"request-type": "SetSourceSettings", "message-id": "fix " + source,
		"sourceName": source, "sourceSettings": {}}
	ws.send(json.dumps(data))
while ws.connected:
	data = ws.recv()
	if not data: break
	data = json.loads(data)
	id = data.get("message-id")
	if id.startswith("fix "):
		try: sources.remove(id[4:])
		except ValueError: pass
		if not sources: # All done!
			print("* Camera should be fixed *")
			ws.close() # Will break the loop.
