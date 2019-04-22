const canvasx = 1920, canvasy = 1080; /* Currently, the OBS canvas size isn't available. For now, hacked in. */
const display_scale = 0.75; //TODO: Calculate a viable value for this based on the canvas size and window size
let layout = null; //If set, it's the DOM node that we render the layout into. If not, don't render.

const sourcetypes = {}; //Info from GetSourceTypesList, if available (ignored if not)

let resize_source = null, move_source = null; //If available, will resize/move a source in OBS
const resizeObserver = new ResizeObserver(entries => {
	for (let entry of entries) {
		const el = entry.target;
		const cx = entry.contentRect.width / display_scale;
		if (!el.dataset.reset_width) continue; //Suppress resize events caused by display rerendering
		const scale = cx / el.dataset.base_cx;
		el.style.height = (scale * el.dataset.base_cy * display_scale) + "px";
		//NOTE: If the scene changes while you're dragging, this may set the size
		//on the wrong scene. Caveat resizor.
		if (resize_source) resize_source(el.dataset.sourcename, scale);
		el.dataset.last_obs_cx = -1;
		//console.log("RESIZE:", el.dataset.sourcename, scale);
	}
});

function max(a, b) {return a > b ? a : b;}

//Since a div won't give me key events, we need to hook that on the document.
let dragging = null;
document.onkeydown = ev => {if (ev.key === "Escape") {
	dragging.style.width = dragging.dataset.reset_width;
	dragging.style.left = dragging.dataset.reset_left;
	dragging.style.top = dragging.dataset.reset_top;
	dragging.style.resize = "none"; //Prevent resizing until the mouse button is released
}};

function keepdragging(ev) {
	const x = ev.clientX - this.dataset.baseX;
	const y = ev.clientY - this.dataset.baseY;
	this.style.left = x + "px";
	this.style.top  = y + "px";
	if (move_source) move_source(this.dataset.sourcename, x / display_scale, y / display_scale);
}

function startdragging(ev) {
	if (ev.ctrlKey)
	{
		//Holding Ctrl moves and won't allow resizing
		ev.preventDefault();
		this.dataset.baseX = ev.clientX - parseFloat(this.style.left);
		this.dataset.baseY = ev.clientY - parseFloat(this.style.top);
		this.onpointermove = keepdragging;
		this.setPointerCapture(ev.pointerId);
	}
	//Without Ctrl, we might resize, if the cursor was on the grab handle.
	//Snapshot enough details for the Esc key to reset everything.
	dragging = this;
	this.dataset.reset_width = this.style.width;
	this.dataset.reset_left = this.style.left;
	this.dataset.reset_top = this.style.top;
}

function stopdragging(ev) {
	if (this === dragging) {
		//this.style.left = this.dataset.reset_left;
		//this.style.top = this.dataset.reset_top;
		this.style.resize = this.onpointermove = dragging = null;
		this.releasePointerCapture(ev.pointerId);
	}
}

function update(name, sources) {
	//console.log("Sources:", sources);
	document.getElementById("scene_name").innerText = name;
	const vol = document.getElementById("volumes").firstChild;
	vol.innerHTML = "";
	if (layout) while (layout.lastChild) resizeObserver.unobserve(layout.removeChild(layout.lastChild));
	sources.forEach(source => {
		//Using forEach for the closure :)
		const typeinfo = sourcetypes[source.type];
		if (layout && typeinfo && typeinfo.caps.hasVideo) {
			//console.log(`Source: (${source.x},${source.y})-(${source.x+source.cx},${source.y+source.cy}) -- ${source.name}`);
			//TODO: If the scene item is locked, don't make it resizable (but allow lock to be toggled)
			const el = document.createElement("DIV");
			el.appendChild(document.createTextNode(source.name));
			el.style.width = max(source.cx * display_scale, 15) + "px";
			el.style.height = max(source.cy * display_scale, 15) + "px";
			el.style.left = (source.x * display_scale) + "px";
			el.style.top = (source.y * display_scale) + "px";
			el.dataset.sourcename = source.name;
			el.dataset.base_cx = source.source_cx;
			el.dataset.base_cy = source.source_cy;
			el.onpointerdown = startdragging;
			el.onpointerup = stopdragging;
			resizeObserver.observe(el);
			layout.appendChild(el);
		}
		if (typeinfo && !typeinfo.caps.hasAudio) return; //It's a non-audio source. (Note that browser sources count as non-audio, despite being able to make noises.)
		//Note that if !typeinfo, we assume no video, but DO put it on the mixer.
		const src = document.createElement("TR");
		src.innerHTML = "<th></th><td><input class=volslider type=range min=0 max=1 step=any></td><td><span class=percent></span><button type=button>Mute</button></td>";
		const th = src.firstChild;
		th.insertBefore(document.createTextNode(source.name), th.firstChild);
		const inp = src.querySelector("input");
		inp.value = Math.sqrt(source.volume);
		src.querySelector("span").innerText = (source.volume*100).toFixed(2);
		inp.oninput = ev => {
			const val = ev.target.value * ev.target.value;
			ev.target.closest("tr").querySelector("span").innerText = (val*100).toFixed(2);
			send_request("SetVolume", {"source": source.name, "volume": val});
		}
		src.querySelector("button").onclick = ev => {
			send_request("ToggleMute", {"source": source.name});
		}
		vol.appendChild(src);
	})
}

const events = {
	StreamStatus: data => {
		window.laststatus = data; //For interactive inspection
		for (const key of Object.keys(data)) {
			const dom = document.getElementById("status_" + key.split("-").join("_"));
			if (dom) dom.innerText = data[key];
		}
	},
	SwitchScenes: data => update(data["scene-name"], data.sources),
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
		socket.send(JSON.stringify(data));
		pending[id] = [res, rej];
	});
	window.send_request = (type, data) => { //For console testing
		send_request(type, data)
			.then(data => console.log(data))
			.catch(err => console.error(err));
	}
	socket.onopen = async () => {
		console.log("Connected");
		send_request("GetVersion")
			.then(data => {
				console.info("Running on OBS " + data["obs-studio-version"]
					+ " and obs-websocket " + data["obs-websocket-version"]);
				if (data["obs-websocket-version"] >= "4.3.0") {
					layout = document.getElementById("layout");
					layout.parentNode.classList.remove("hidden");
					layout.innerHTML = "";
					layout.style.width = (canvasx * display_scale) + "px";
					layout.style.height = (canvasy * display_scale) + "px";
					resize_source = (item, scale) => send_request("SetSceneItemProperties", {
						item,
						scale: {x: scale, y: scale},
					});
					move_source = (item, x, y) => send_request("SetSceneItemProperties", {
						item,
						position: {x, y},
					});
				}
			});
		send_request("GetSourceTypesList")
			.then(data => data.types.forEach(type => sourcetypes[type.typeId] = type))
			.catch(err => 0); //If we can't get the source types, don't bother. It's a nice-to-have only.
		const auth = await send_request("GetAuthRequired");
		if (auth.authRequired) {
			const hash = forge_sha256(pwd + auth.salt);
			const resp = forge_sha256(hash + auth.challenge);
			await send_request("Authenticate", {auth: resp}); //Will throw on auth failure
		}
		const scene = await send_request("GetCurrentScene");
		update(scene.name, scene.sources);
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
