const canvasx = 1920, canvasy = 1080; /* Currently, the OBS canvas size isn't available. For now, hacked in. */
const display_scale = 0.75; //TODO: Calculate a viable value for this based on the canvas size and window size
let layout = null; //If set, it's the DOM node that we render the layout into. If not, don't render.

const sourcetypes = {}; //Info from GetSourceTypesList, if available (ignored if not)

let send_request = null; //When the socket is connected, this is a function.

const resizeObserver = new ResizeObserver(entries => {
	for (let entry of entries) {
		const el = entry.target;
		const cx = entry.contentRect.width / display_scale;
		if (!el.dataset.reset_width) continue; //Suppress resize events caused by display rerendering
		//TODO: Snap to edges and/or middle of canvas or other items
		const scale = cx / el.dataset.base_cx;
		el.style.height = (scale * el.dataset.base_cy * display_scale) + "px";
		//NOTE: If the scene changes while you're dragging, this may set the size
		//on the wrong scene. Caveat resizor.
		send_request("SetSceneItemProperties", {item: el.dataset.sourcename,
			scale: {x: scale, y: scale}});
		el.dataset.last_obs_cx = -1;
		//console.log("RESIZE:", el.dataset.sourcename, scale);
	}
});

function max(a, b) {return a > b ? a : b;}

//Since a div won't give me key events, we need to hook that on the document.
let dragging = null;
document.onkeydown = ev => {if (ev.key === "Escape" && dragging) {
	dragging.style.width = dragging.dataset.reset_width;
	dragging.style.left = dragging.dataset.reset_left;
	dragging.style.top = dragging.dataset.reset_top;
	dragging.style.resize = "none"; //Prevent resizing until the mouse button is released
}};

function keepdragging(ev) {
	//TODO: Snap to edges and/or middle of canvas or other items
	const x = ev.clientX - this.dataset.baseX;
	const y = ev.clientY - this.dataset.baseY;
	this.style.left = x + "px";
	this.style.top  = y + "px";
	send_request("SetSceneItemProperties", {item: this.dataset.sourcename,
		position: {x: x / display_scale, y: y / display_scale}});
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

function set_content(elem, children) {
	while (elem.lastChild) elem.removeChild(elem.lastChild);
	if (!Array.isArray(children)) children = [children];
	for (let child of children) {
		if (child === "") continue;
		if (typeof child === "string") child = document.createTextNode(child);
		elem.appendChild(child);
	}
	return elem;
}
function build(tag, attributes, children) {
	const ret = document.createElement(tag);
	if (attributes) for (let attr in attributes) {
		if (attr.startsWith("data-")) //Simplistic - we don't transform "data-foo-bar" into "fooBar" per HTML.
			ret.dataset[attr.slice(5)] = attributes[attr];
		else ret[attr] = attributes[attr];
	}
	if (children) set_content(ret, children);
	return ret;
}

const dropdowns = {
	"bounds.type": ["OBS_BOUNDS_NONE", "OBS_BOUNDS_STRETCH", "OBS_BOUNDS_SCALE_INNER",
		"OBS_BOUNDS_SCALE_TO_WIDTH", "OBS_BOUNDS_SCALE_TO_HEIGHT", "OBS_BOUNDS_MAX_ONLY"],
	"position.alignment": [ //Bitwise, not an enumeration per se
		"5=Top-Left", "4=Top-Center", "6=Top-Right",
		"1=Center-Left", "0=Center", "2=Center-Right",
		"9=Bottom-Left", "8=Bottom-Center", "10=Bottom-Right",
	],
};

function build_details(props, pfx) {
	const items = [];
	for (const prop in props) {
		const val = props[prop];
		let display = prop + " => " + val;
		const dd = dropdowns[pfx + prop];
		if (dd) {
			//Create a drop-down from either an array (value equals description)
			//or an object (value: description).
			const opts = dd.map(def => {
				const [v, d] = def.split("=");
				return build("option", {value: v}, d || v);
			});
			display = build("select", {"data-prop": pfx + prop, "data-origval": val, "data-numeric": 1}, opts);
			display.value = val; //Must be done _after_ the children are added
		}
		else switch (typeof val) {
			case "boolean":
				display = build("label", 0, [prop, build("input", {
					type: "checkbox", checked: val,
					"data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			case "object": display = [prop, build("ul", 0, build_details(val, pfx + prop + "."))]; break;
			case "number": case "string":
				display = build("label", 0, [prop + " ", build("input", {
					type: typeof val === "number" ? "number" : "text",
					step: "any", //Prevent numeric fields from forcing to integer
					value: val, "data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			default: break;
		}
		items.push(build("li", null, display));
	}
	return items;
}

async function itemdetails(item) {
	const props = await send_request("GetSceneItemProperties", {item});
	delete props["message-id"]; delete props["status"]; delete props["name"];
	console.log("Got props:", props);
	set_content(document.querySelector("#itemprops ul"), build_details(props, ""));
	set_content(document.querySelector("#itemprops h3"), "Details for '" + item + "'");
	const modal = document.getElementById("itemprops");
	document.getElementById("itemprops_apply").onclick = async ev => {
		console.log("Applying changes to item", item);
		const updates = {}; let changes = 0;
		modal.querySelectorAll("[data-prop]").forEach(el => {
			let val = el.type === "checkbox" ? el.checked : el.value;
			if (""+val === el.dataset.origval) return;
			if (el.type === "number" || el.dataset.numeric) val = parseFloat(val);
			const path = el.dataset.prop.split(".");
			const leaf = path.pop();
			let target = updates;
			for (let p of path) {
				if (!target[p]) target[p] = {};
				target = target[p];
			}
			target[leaf] = val;
			++changes;
		});
		modal.close();
		if (!changes) {console.log("No changes"); return;}
		console.log("Updating", item, updates);
		updates.item = item;
		await send_request("SetSceneItemProperties", updates);
		//After making any changes, do a full update. Simpler that way.
		const scene = await send_request("GetCurrentScene");
		update(scene.name, scene.sources);
	};
	modal.showModal();
}

function update(name, sources) {
	//console.log("Sources:", sources);
	document.getElementById("scene_name").innerText = name;
	const vol = document.getElementById("volumes").firstChild;
	vol.innerHTML = "";
	if (layout) while (layout.lastChild) resizeObserver.unobserve(layout.removeChild(layout.lastChild));
	const item_descs = [];
	sources.forEach(source => {
		//Using forEach for the closure :)
		const typeinfo = sourcetypes[source.type];
		if (layout && typeinfo && typeinfo.caps.hasVideo) {
			//console.log(`Source: (${source.x},${source.y})-(${source.x+source.cx},${source.y+source.cy}) -- ${source.name}`);
			//TODO: If the scene item is locked, don't make it resizable (but allow lock to be toggled)
			//TODO: Correctly handle item gravity (alignment)
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
			el.ondblclick = ev => itemdetails(source.name);
			resizeObserver.observe(el);
			layout.appendChild(el);
			item_descs.push(build("li", 0, build("button", {onclick: ev => itemdetails(source.name)}, source.name)));
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
	if (layout) set_content(document.getElementById("sceneitems"), item_descs);
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
	send_request = (type, data={}) => new Promise((res, rej) => {
		const id = "msg" + counter++;
		data = Object.assign({"request-type": type, "message-id": id}, data);
		socket.send(JSON.stringify(data));
		pending[id] = [res, rej];
	});
	window.req = (type, data) => { //For console testing
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
					layout.closest("details").classList.remove("hidden");
					layout.innerHTML = "";
					layout.style.width = (canvasx * display_scale) + "px";
					layout.style.height = (canvasy * display_scale) + "px";
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
	document.getElementById("itemprops_cancel").onclick = ev => document.getElementById("itemprops").close();
}
