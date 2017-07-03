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
	const params = /#(.*)@(.*)/.exec(window.location.hash || "");
	let server = "localhost", pwd = null;
	if (params) {server = params[2]; pwd = params[1];}
	const socket = new WebSocket("ws://" + server + ":4444/"); //Hard coded port for now
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
		//console.log("Version:", await send_request("GetVersion"));
		const auth = await send_request("GetAuthRequired");
		if (auth.authRequired) {
			const hash = forge_sha256(pwd + auth.salt);
			const resp = forge_sha256(hash + auth.challenge);
			await send_request("Authenticate", {auth: resp}); //Will throw on auth failure
		}
		const scene = await send_request("GetCurrentScene");
		const vol = document.getElementById("volumes").firstChild;
		scene.sources.forEach(source => {
			//Using forEach for the closure :)
			const src = document.createElement("TR");
			src.innerHTML = "<th></th><td><input class=volslider type=range min=0 max=1 step=any></td><td><span></span></td>";
			const th = src.firstChild;
			th.insertBefore(document.createTextNode(source.name), th.firstChild);
			const inp = src.querySelector("input");
			inp.value = Math.sqrt(source.volume);
			src.querySelector("span").innerText = source.volume;
			inp.oninput = ev => {
				//TODO: Format as percentage?
				const val = ev.target.value * ev.target.value;
				ev.target.closest("tr").querySelector("span").innerText = val;
				send_request("SetVolume", {"source": source.name, "volume": val});
			}
			vol.appendChild(src);
		})
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
