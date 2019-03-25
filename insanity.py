# Insanity for JiB410_
"""
Critical POC:
* Log in
* Start timer
* Prepare DEATH CAM 1 scene
  - Set five separate render delays each to 5ms
  - Wait for responses from OBS
* Check timer. Is it <50ms?
send_request("SetSourceFilterSettings", {sourceName: "DEATH CAM", filterName: "Render Delay", filterSettings: {delay_ms: 0}})
"""

import json
import threading
import time

# TODO: Reimplement the essential parts (mainly the handshake) and
# drop the rest. This is a way bigger import than we need.
import websocket # ImportError? Try: pip install websocket-client

# TODO: Parameterize
server = "localhost"
password = ""

ws = websocket.create_connection("ws://" + server + ":4444/")

nextid = 0
callbacks = {}
def send_request(type, data={}, cb=None):
	global nextid
	id = "msg%d" % nextid
	nextid += 1
	data = {"request-type": type, "message-id": id, **data}
	if cb: callbacks[id] = cb
	ws.send(json.dumps(data))
	return id

def recvthread():
	while ws.connected:
		data = ws.recv()
		if not data: break
		data = json.loads(data)
		# print("Message:", data) # for debugging
		id = data.get("message-id")
		if id in callbacks:
			f = callbacks[id]; del callbacks[id]
			f(data)
threading.Thread(target=recvthread).start()
send_request("GetAuthRequired")
send_request("GetVersion")

class countdown:
	def __init__(self):
		self.counter = 5
		self.start = time.time_ns()
	def __call__(self, data):
		self.counter -= 1
		if self.counter: return
		self.end = time.time_ns()
		print("TIME TAKEN: {:,}ns".format(self.end - self.start))

def set_delay(scene, delay):
	"""Set a particular scene's delay (in 5ms units)"""
	timer = countdown()
	for filter in range(1, 6):
		# send_request("SetSourceFilterSettings", {
			# "sourceName": "DEATH CAM %d" % scene,
			# "filterName": "Render Delay %d" % filter,
			# "filterSettings": {"delay_ms": delay * 10},
		# }, cb=cb)
		send_request("SetSceneItemTransform", {
			"scene-name": "DEATH CAM %d" % scene,
			"item": "Text %d" % filter,
			"x-scale": 6.75, "y-scale": 6.75,
			"rotation": delay * 360 / 50,
		}, cb=timer)

set_delay(1, 0)
set_delay(2, 1)

while True:
	cmd = input("Hit Enter to time, or q to quit: ")
	if cmd.casefold().startswith("q"): break
	transition = []
	send_request("GetCurrentTransition", cb=transition.append)
	send_request("SetCurrentTransition", {"transition-name": "Cut"})
	send_request("SetTransitionDuration", {"duration": 25})
	time.sleep(0.25)
	# send_request("SetCurrentScene", {"scene-name": "DEATH CAM 1"})
	start = time.time()
	for delay in range(50):
		scene = (delay & 1) + 1
		set_delay(scene, delay)
		target = start + 0.050 * delay
		wait = target - time.time()
		print("%.2f" % (wait * 1000), end="... ")
		if wait > 0: time.sleep(wait)
		send_request("SetCurrentScene", {"scene-name": "DEATH CAM %d" % scene})
	time.sleep(0.25)
	send_request("SetCurrentScene", {"scene-name": "Pure screen"})
	if transition:
		send_request("SetCurrentTransition", {"transition-name": transition[0]["name"]})
		send_request("SetTransitionDelay", {"duration": transition[0]["duration"]})
		print("Resetting transition to", transition[0]["name"], transition[0]["duration"])
send_request("SetCurrentScene", {"scene-name": "Starting soon"})
ws.close()
