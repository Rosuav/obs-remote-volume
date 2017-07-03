const events = {
	StreamStatus: data => {
		for (const key of Object.keys(data)) {
			const dom = document.getElementById("status_" + key.split("-").join("_"));
			if (dom) dom.innerText = data[key];
		}
	},
};

function setup()
{
	console.log("Initializing");
	const socket = new WebSocket("ws://localhost:4444/"); //Hard coded for now
	let counter = 0;
	const pending = {};
	const send_request = (type, data={}) => new Promise((res, rej) => {
		const id = "msg" + counter++;
		data = Object.assign({"request-type": type, "message-id": id}, data);
		console.log("Sending:", data);
		socket.send(JSON.stringify(data));
		pending[id] = [res, rej];
	});
	window.send_request = (type, data) => { //For console testing
		send_request(type, data)
			.then(data => console.log(data))
			.catch(err => console.error(data));
	}
	socket.onopen = async () => {
		console.log("Connected");
		const data = await send_request("GetVersion");
		console.log("Version:", data);
	}
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
		if (data["message-id"]) {
			const resrej = pending[data["message-id"]];
			if (!resrej) return; //Response to an unknown message
			delete pending[data["message-id"]];
			if (data.status === "ok") resrej[0](data); //Resolve
			else resrej[1](data); //Reject
			return;
		}
		console.log("Unknown packet:", data);
	};
}
