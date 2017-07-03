const events = {
	StreamStatus: data => {
		console.log("Stream status");
	},
};

function setup()
{
	console.log("Initializing");
	const socket = new WebSocket("ws://localhost:4444/"); //Hard coded for now
	socket.onopen = () => console.log("Connected");
	//const announce_pos = (n) => socket.send(JSON.stringify({type: "setpos", data: n}))
	socket.onmessage = (ev) => {
		const data = JSON.parse(ev.data);
		if (data["update-type"])
		{
			const func = events[data["update-type"]];
			if (func) return func(data);
			//Unknown events get logged once and then no more.
			console.log("Unknown event:", data["update-type"]);
			events[data["update-type"]] = () => {};
			return;
		}
		console.log("Unknown packet:", data);
	};
}
