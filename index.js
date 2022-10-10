import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {IMG, INPUT, LABEL, LI, OPTION, SELECT, UL} = choc; //autoimport
import {override_layout} from "./layout.js";
import {send_updates, adjust_state} from "./sections.js";
//For some reason, importing from sikorsky.rosuav.com fails with a CORS error. I don't
//understand what's going on, as I've sent all the same headers GitHub does and it's still
//failed. This is STUPID. I don't understand why I'm not allowed to host a library file on
//my own server, but I am allowed to copy the file and incorporate it in the repository;
//but oh, if it's on GitHub Pages, that's absolutely fine!
//All this is only an issue because of a different problem, too: that https://vol.rosuav.com/
//is not allowed to connect to a non-encrypted websocket. Which means that, in the name of
//security, we have to fetch the application code over an unencrypted connection. It's, uhh,
//more secure that way. Obviously.
import {simpleconfirm} from "./stillebot_utils.js";

let canvasx = 1920, canvasy = 1080; //OBS canvas size is available only with fairly new obs-websocket builds. Otherwise, we take a guess.
let display_scale = 0.625; //Updated whenever we get a full set of new sources
const obsenum = {WebSocketOpCode: {0: "Hello"}}; //Seed with the only message we absolutely have to be able to comprehend initially

const sourcetypes = {}; //Info from GetSourceTypesList, if available (ignored if not)

let send_request = null; //When the socket is connected, this is a function.
let handshake = "guess"; //Or "v4" or "v5"
let connect_info = {ssl: false, v5: true, ip: "localhost", port: 4455, password: "", revealpwd: false}, connected = false;
const v4v5 = (v4, v5) => handshake === "v5" ? v5 : v4;

const state = { //Updated and passed along to modules
	connect_info,
	sourcetypes,
	sources: [], sources_by_origin: { },
	scenes: {scenes: [], currentProgramSceneName: ""},
	status: {stream: "OBS_WEBSOCKET_OUTPUT_STOPPED", record: "OBS_WEBSOCKET_OUTPUT_STOPPED"},
};
function repaint() {send_updates(state);}

if (!window.ResizeObserver) {
	//Older browsers don't have this. Prevent crashes, but don't try to actually implement anything.
	const p = (window.ResizeObserver = function(callback) { }).prototype;
	p.observe = p.unobserve = function(el) { };
}
const show_preview_images = 0;

//NOTE: Resizing when gravity is not top-left actually manipulates the position
//as well as the scale. This may be a tad odd, but it's the best we can do, short
//of implementing our own grab handles.
const resizeObserver = new ResizeObserver(entries => {
	for (let entry of entries) {
		const el = entry.target;
		const cx = entry.contentRect.width / display_scale;
		if (!el.dataset.reset_width) continue; //Suppress resize events caused by display rerendering
		//TODO: Snap to edges and/or middle of canvas or other items
		const scale = cx / el.dataset.base_cx;
		const update = {item: el.dataset.name, //FIXME: Use ID instead
			scale: {x: scale, y: scale}};
		const xofs = parseFloat(el.dataset.grav_x), yofs = parseFloat(el.dataset.grav_y);
		const rescale = scale / parseFloat(el.dataset.last_scale);
		if (xofs || yofs) update.position = {
			x: parseFloat(el.style.left) / display_scale + xofs * rescale,
			y: parseFloat(el.style.top)  / display_scale + yofs * rescale,
		};
		el.style.height = (scale * el.dataset.base_cy * display_scale) + "px";
		//NOTE: If the scene changes while you're dragging, this may set the size
		//on the wrong scene. Caveat resizor.
		send_request("SetSceneItemProperties", update);
		//console.log("RESIZE:", el.dataset.name, scale);
	}
});

function max(a, b) {return a > b ? a : b;}
function min(a, b) {return a < b ? a : b;}

//Since a div won't give me key events, we need to hook that on the document.
let dragging = null, dragreset = null;
document.onkeydown = ev => {if (ev.key === "Escape" && dragging) {
	dragging.style.width = dragging.dataset.reset_width;
	dragging.style.left = dragging.dataset.reset_left;
	dragging.style.top = dragging.dataset.reset_top;
	dragging.style.resize = "none"; //Prevent resizing until the mouse button is released
	if (dragreset !== true) send_request("SetSceneItemProperties", dragreset);
	dragreset = null; //Don't wipe dragging yet - let that happen when the button is released
}};

function drag_xfrm(el, x, y) {
	return {item: el.dataset.name, position: { //FIXME: Use ID instead
		x: x / display_scale + parseInt(el.dataset.grav_x, 10),
		y: y / display_scale + parseInt(el.dataset.grav_y, 10),
	}};
}

function keepdragging(ev) {
	if (!dragreset) return;
	//TODO: Snap to edges and/or middle of canvas or other items
	const x = ev.clientX - this.dataset.baseX;
	const y = ev.clientY - this.dataset.baseY;
	this.style.left = x + "px";
	this.style.top  = y + "px";
	send_request("SetSceneItemProperties", drag_xfrm(this, x, y));
}

function startdragging(ev) {
	if (ev.target.classList.contains("locked")) return; //No dragging locked elements.
	if (ev.ctrlKey)
	{
		//Holding Ctrl moves and won't allow resizing
		ev.preventDefault();
		const x = parseFloat(this.style.left);
		const y = parseFloat(this.style.top);
		this.dataset.baseX = ev.clientX - x;
		this.dataset.baseY = ev.clientY - y;
		this.onpointermove = keepdragging;
		this.setPointerCapture(ev.pointerId);
		dragreset = drag_xfrm(this, x, y);
	}
	else dragreset = true;
	//Without Ctrl, we might resize, if the cursor was on the grab handle.
	//Snapshot enough details for the Esc key to reset everything.
	dragging = this;
	this.dataset.reset_width = this.style.width;
	this.dataset.last_scale = parseFloat(this.style.width) / display_scale / this.dataset.base_cx;
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
				return OPTION({value: v}, d || v);
			});
			display = SELECT({"data-prop": pfx + prop, "data-origval": val, "data-numeric": 1}, opts);
			display.value = val; //Must be done _after_ the children are added
		}
		else switch (typeof val) {
			case "boolean":
				display = LABEL([prop, INPUT({
					type: "checkbox", checked: val,
					"data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			case "object": display = [prop, UL(build_details(val, pfx + prop + "."))]; break;
			case "number": case "string":
				display = LABEL([prop + " ", INPUT({
					type: typeof val === "number" ? "number" : "text",
					step: "any", //Prevent numeric fields from forcing to integer
					value: val, "data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			default: break;
		}
		items.push(LI(display));
	}
	return items;
}

async function itemdetails(origin) {
	let props = { };
	const source = state.sources_by_origin[origin];
	if (handshake === "v4") {
		props = await send_request("GetSceneItemProperties", {"scene-name": source.sceneName, item: {id: source.sceneItemId}});
		delete props["message-id"]; delete props["status"]; delete props["name"];
	}
	else {
		//TODO: Batch these requests
		const ident = {sceneName: source.sceneName, sceneItemId: source.sceneItemId};
		const info = await send_request("Batch", [
			["GetInputSettings", {inputName: source.sourceName}],
			["GetInputDefaultSettings", {inputKind: source.inputKind}],
			["GetSceneItemTransform", ident],
			["GetSceneItemEnabled", ident],
			["GetSceneItemLocked", ident],
			["GetSceneItemBlendMode", ident],
		]);
		if (info[0].requestStatus.result && info[1].requestStatus.result)
			props.settings = {...info[1].responseData.defaultInputSettings, ...info[0].responseData.inputSettings};
		for (let i = 2; i < info.length; ++i) if (info[i].requestStatus.result) {
			const kw = info[i].requestType.slice("GetSceneItem".length);
			props[kw.toLowerCase()] = info[i].responseData["sceneItem" + kw];
		}
	}
	set_content("#itemprops_list", build_details(props, ""));
	set_content("#itemprops h3", "Details for '" + source.sourceName + "'");
	//if (handshake === "v5") DOM("#itemprops_list").appendChild(IMG({src: (await send_request("GetSourceScreenshot", {sourceName: item, imageFormat: "png"})).imageData}));
	const modal = document.getElementById("itemprops");
	document.getElementById("itemprops_apply").onclick = async ev => { //TODO: Do this with on() instead of messy closures
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
		if (!changes) return;
		if (handshake === "v4") {
			updates.item = {id: source.sceneItemId};
			updates["scene-name"] = source.sceneName;
			await send_request("SetSceneItemProperties", updates);
		} else {
			const req = [];
			if (updates.settings) req.push(["SetInputSettings", {
				inputName: source.sourceName,
				inputSettings: updates.settings,
			}]);
			["Transform", "Enabled", "Locked", "BlendMode"].forEach(kw =>
				(kw.toLowerCase() in updates) && req.push(["SetSceneItem" + kw,
					{sceneName: source.sceneName, sceneItemId: source.sceneItemId,
						["sceneItem" + kw]: updates[kw.toLowerCase()]}]));
			if (req.length) await send_request("Batch", req);
		}
		full_update(); //After making any changes, do a full update. Simpler that way.
	};
	modal.showModal();
}
on("click", ".sceneelembtn", e => itemdetails(e.match.dataset.origin));
on("dblclick", ".sceneelement", e => itemdetails(e.match.dataset.origin));

function update_element(el, xfrm) {
	//Default to top-left if obs-websocket doesn't give the actual alignment
	if (xfrm.position.alignment === undefined) xfrm.position.alignment = 5;
	let xofs = xfrm.width;
	switch (xfrm.position.alignment & 3) {
		case 1: xofs = 0; break; //Left
		case 0: xofs /= 2; break; //Center
		case 2: break; //Right
	}
	let yofs = xfrm.height;
	switch (xfrm.position.alignment & 12) {
		case 4: yofs = 0; break; //Top
		case 0: yofs /= 2; break; //Center
		case 8: break; //Bottom
	}
	let left = xfrm.position.x - xofs, top = xfrm.position.y - yofs;
	let right = left + xfrm.width, bottom = top + xfrm.height;
	if (left < 0) left = 0; if (top < 0) top = 0;
	if (right >= canvasx) right = canvasx - 1;
	if (bottom >= canvasy) bottom = canvasy - 1;
	el.style.width = max((right - left) * display_scale, 15) + "px";
	el.style.height = max((bottom - top) * display_scale, 15) + "px";
	el.style.left = (left * display_scale) + "px";
	el.style.top = (top * display_scale) + "px";
	el.dataset.grav_x = xofs;
	el.dataset.grav_y = yofs;
	el.dataset.base_cx = xfrm.sourceWidth;
	el.dataset.base_cy = xfrm.sourceHeight;
	el.classList.toggle("locked", xfrm.locked);
	el.style.zIndex = xfrm.locked ? 1 : 1000;
}

async function set_bg_img(el, sourcename, width) {
	try {
		const resp = await send_request("TakeSourceScreenshot", {sourceName: sourcename, embedPictureFormat: "png", width});
		console.log("Got image for", sourcename);
		el.style.backgroundImage = "url(" + resp.img + ")";
		el.style.opacity="0.25";
	}
	catch (err) {console.error("Couldn't get image for", source.name, err);}
}

async function full_update() {
	const scenes = await send_request("GetSceneList");
	state.scenes = scenes;
	if (handshake === "v4") {
		const scene = await send_request("GetCurrentScene");
		scenes.currentProgramSceneName = scenes["current-scene"];
		scenes.scenes = scenes.scenes.map(s => ({sceneName: s.name}));
		scene.sources.forEach(src => {
			//Fold some attributes to their v5 names for convenience
			src.sourceName = src.name;
			src.sceneItemId = src.id;
			src.sceneName = scenes["current-scene"];
		});
		state.sources = scene.sources;
	} else {
		scenes.scenes.reverse(); //HACK: Currently, OBS WS v5 seems to return them in the wrong order.
		const scenename = scenes.currentProgramSceneName;
		//TODO: Create scene selection buttons for scenes.scenes[].sceneName
		const sceneitems = (await send_request("GetSceneItemList", {sceneName: scenename})).sceneItems;
		sceneitems.forEach(s => s.sceneName = scenename);
		state.sources = sceneitems;
	}
	//Build a mapping from name to info object
	state.sources_by_origin = { };
	state.sources.forEach(s => state.sources_by_origin[s.origin = s.sceneName + ":" + s.sceneItemId] = s);
	//If there's a group or scene in the scene, recursively fetch its children.
	//I don't THINK it's possible to infinitely recurse here, but just in case,
	//only fetch what we haven't yet fetched.
	if (handshake === "v4") ; //Not sure what to do on v4, there may be a children element already.
	else {
		for (let i = 0; i < state.sources.length; ++i) { //ensure that newly added elements will be iterated over
			const source = state.sources[i];
			if (source.inputKind) continue; //Groups and subscenes have inputKind === null
			(await send_request(
				source.isGroup ? "GetGroupSceneItemList" : "GetSceneItemList",
				{sceneName: source.sourceName},
			)).sceneItems.forEach(src => {
				src.sceneName = source.sourceName;
				src.origin = src.sceneName + ":" + src.sceneItemId;
				if (state.sources_by_origin[src.origin]) return; //Already sighted. Prevent infinite recursion.
				state.sources.push(src);
				state.sources_by_origin[src.origin] = src;
			});
		}
		const volumes = await send_request("GetInputVolume",
			state.sources.map(i => ({inputName: i.sourceName})),
			"RequestBatch");
		volumes.forEach((v, i) => {
			const item = state.sources[i];
			const t = sourcetypes[item.inputKind] = {caps: { }};
			//Requests that succeed definitely indicate input kinds that have audio.
			//We assume for now that failure is caused by the input not having
			//audio, although it's possible there are other errors.
			t.caps.hasAudio = v.requestStatus.result;
			if (t.caps.hasAudio) item.volume = v.responseData.inputVolumeMul;
		});
	}
	repaint();
}

on("input", ".volslider", e => {
	const tr = e.match.closest("tr");
	tr.dataset.debounce = +new Date + 100; //Block incoming updates for 100ms
	send_request(v4v5("SetVolume", "SetInputVolume"), {
		[v4v5("source", "inputName")]: state.sources_by_origin[e.match.closest("tr").dataset.origin].sourceName,
		[v4v5("volume", "inputVolumeMul")]: e.match.value ** 2,
	});
});
on("click", ".mutebtn", e => send_request("ToggleMute", {"source": state.sources_by_origin[e.match.closest("tr").dataset.origin].sourceName}));

on("click", "[data-sceneselect]", e =>
	send_request(v4v5("SetCurrentScene", "SetCurrentProgramScene"),
		{[v4v5("scene-name", "sceneName")]: e.match.dataset.sceneselect}));

const events = {
	//For some of these, we probably could be more efficient, but it's simpler to just full-update.
	SceneItemAdded: data => full_update(), //v4
	SceneItemCreated: data => full_update(), //v5
	SceneItemRemoved: data => full_update(), //v4 and v5
	SwitchScenes: data => fire_event("CurrentProgramSceneChanged", {currentProgramSceneName: data["scene-name"]}), //v4
	CurrentProgramSceneChanged: data => { //v5
		state.scenes.currentProgramSceneName = data.sceneName;
		repaint();
		full_update();
	},
	SceneItemTransformChanged: data => { //v4
		//const source = state.sources_by_name[data["item-name"]]; //FIXME: Do this by ID not name
		//NOTE: If a scene item is moved in OBS while being dragged here, we will
		//ignore the OBS movement and carry on regardless. This includes if you
		//hit Escape; we'll reset to where WE last saw it. This event happens in
		//response to our own dragging, so this prevents lag-induced glitchiness.
		//if (!source) return;
		//update_element(el, data.transform); //TODO: Update elements for this source, except if being dragged
	},
	SceneItemLockChanged: data => { //v4
		//const source = state.sources_by_name[data["item-name"]]; //FIXME: Do this by ID not name
		//if (source) {
			//FIXME: Hot-update. Both of these two callbacks relate to the wireframe
			//and may need to be handled in the wireframe's section.
			//el.classList.toggle("locked", data["item-locked"]);
			//el.style.zIndex = data["item-locked"] ? 1 : 1000;
		//}
	},
	SourceVolumeChanged: data => fire_event("InputVolumeChanged", {inputName: data.sourceName, inputVolumeMul: data.volume}),
	SourceMuteStateChanged: data => fire_event("InputMuteStateChanged", {inputName: data.sourceName, inputMuted: data.muted}),
	InputVolumeChanged: data => { //v5
		state.sources.forEach(source => source.sourceName === data.inputName &&
			[source.volume = data.inputVolumeMul, adjust_state(source)]);
	},
	InputMuteStateChanged: data => { //v5
		state.sources.forEach(source => source.sourceName === data.inputName &&
			[source.muted = data.inputMuted, adjust_state(source)]);
	},
	StreamStarting: data => fire_event("StreamStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STARTING"}),
	StreamStarted: data => fire_event("StreamStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STARTED"}),
	StreamStopping: data => fire_event("StreamStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STOPPING"}),
	StreamStopped: data => fire_event("StreamStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED"}),
	RecordingStarting: data => fire_event("RecordStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STARTING"}),
	RecordingStarted: data => fire_event("RecordStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STARTED"}),
	RecordingStopping: data => fire_event("RecordStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STOPPING"}),
	RecordingStopped: data => fire_event("RecordStateChanged", {outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED"}),
	StreamStateChanged: data => {state.status.stream = data.outputState; repaint();},
	RecordStateChanged: data => {state.status.record = data.outputState; repaint();},
};

function fire_event(type, data) {
	const func = events[type];
	if (func) return func(data);
	//Unknown events get logged once and then no more.
	console.log("Unknown event:", type, data);
	events[type] = () => {};
}

function parse_uri(string) {
	//Parse the URI and put the components into the other fields
	const uri = /^([a-z]+:\/\/)?(?:([^@]*)@)?([^:/]+)(?::([0-9]+))?\/?(.*)$/.exec(string);
	if (!uri) return "Unparseable";
	const [_, proto, pwd1, ip, port, pwd2] = uri;
	const ssl = ["obswss://", "wss://", "ssl://", "https://"].includes(proto);
	const v5 = ["obswss://", "obsws://"].includes(proto);
	Object.assign(connect_info, {ssl, v5, ip, port: port || (v5 ? 4455 : 4444)});
	const password = pwd1 || pwd2 || "";
	//When the password is hidden, don't clear out an existing password.
	if (password || connect_info.revealpwd) connect_info.password = password;
	build_uri();
}
function build_uri() {
	const proto = (
		(connect_info.v5 ? "obsws" : "ws") +
		(connect_info.ssl ? "s" : "")
	);
	connect_info.uri = `${proto}://${connect_info.ip}:${connect_info.port}/`;
	if (connect_info.revealpwd) connect_info.uri += connect_info.password;
}

on("input", "[data-subtype=connect] input", e => {
	if (e.match.id === "uri") parse_uri(e.match.value);
	else {
		connect_info[e.match.id] = e.match[e.match.type === "checkbox" ? "checked" : "value"];
		//If you just toggled the V5 checkbox and the port was the default, make it the default still.
		if (e.match.id === "v5") {
			const defaults = {false: 4444, true: 4455};
			if (defaults[!connect_info.v5] === +connect_info.port)
				connect_info.port = defaults[connect_info.v5];
		}
		build_uri();
	}
	repaint();
});

for (let sr of ["Stream", "Record"]) {
	const srl = sr.toLowerCase();
	on("click", `.status_${srl}ing`, simpleconfirm(
		`Are you sure you want to start/stop ${srl}ing?`, 
		e => send_request(v4v5(`StartStop${sr}ing`, "Toggle" + sr))));
}

on("click", "#fullscreen", e => document.fullscreenElement ? document.exitFullscreen() : document.body.requestFullscreen());

async function protofetch() {
	//Is this the best URL to use? Should we lock to a specific version tag rather than master?
	const url = "https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.json";
	const data = await (await fetch(url)).json();
	data.enums.forEach(e => {
		const en = obsenum[e.enumType] = { };
		e.enumIdentifiers.forEach(id => {
			en[id.enumIdentifier] = id.enumValue;
			en[id.enumValue] = id.enumIdentifier; //Reverse mapping for console output
		});
	});
	window.obsenum = obsenum;
}
const protocol_fetched = protofetch();

function rerender() {
	if (connected) override_layout(null);
	else override_layout({type: "section", subtype: "connect"});
	repaint();
}
function setup()
{
	//handshake = "guess"; //TODO: Have a good default that lets people not specify protocol
	handshake = connect_info.v5 ? "v5" : "v4";
	const proto = connect_info.ssl ? "wss://" : "ws://";
	const server = connect_info.ip, pwd = connect_info.password, port = connect_info.port;
	console.log("Connect to", proto + server, port, "handshake", handshake)
	state.last_connect_error = ""; repaint();
	const socket = new WebSocket(proto + server + ":" + port);
	let counter = 0;
	const pending = {}, responseids = {};
	let hello_msg = null;
	send_request = (type, data={}, op=6) => new Promise((res, rej) => {
		if (socket.readyState !== 1) return rej("Socket not open");
		const id = "msg" + counter++;
		if (type === "Batch") {
			//Special form: a mixed batch of requests. Provide an array of arrays
			//where each inner array is [type, data], and the results will be returned
			//in the same order.
			if (handshake === "v4") return rej("Batches are a v5 feature.");
			data = {op: obsenum.WebSocketOpCode.RequestBatch, d: {
				requestId: id,
				requests: data.map(([t, d]) => ({requestType: t, requestData: d})),
			}};
		} else if (op === 6) {
			//Standard request.
			if (handshake === "v4") data = {"request-type": type, "message-id": id, ...data};
			else data = {op, d: {requestType: type, requestId: id, requestData: data}};
		} else if (op === "RequestBatch") {
			//Batch of requests. Give it a single ID, and return the array of responses.
			if (handshake === "v4") return rej("Batches are a v5 feature.");
			data = {op: obsenum.WebSocketOpCode[op], d: {
				requestId: id,
				requests: data.map(r => ({requestType: type, requestData: r})),
			}};
		} else {
			//Some other sort of message. Pass the textual or numeric opcode as the op.
			//The type here is actually the (textual) opcode of the response (if null, no response needed).
			if (typeof op !== "number") op = obsenum.WebSocketOpCode[op];
			if (type) responseids[type] = id;
			data = {op, d: data};
		}
		pending[id] = [res, rej];
		//Special case: GetAuthRequired is not a message in v5
		if (handshake === "v5" && type === "GetAuthRequired") {
			if (hello_msg) res(hello_msg); //Got it already? Respond immediately.
			else responseids["Hello"] = id; //Wait for the server to send it.
			return;
		}
		//console.log("Sending", data);
		socket.send(JSON.stringify(data));
	});
	window.req = (type, data) => { //For console testing
		send_request(type, data)
			.then(data => console.log(data))
			.catch(err => console.error(err));
	}
	let handshake_guess;
	socket.onopen = async () => {
		console.log("Connected");
		if (handshake === "guess") handshake = await new Promise(r => setTimeout(handshake_guess = r, 100, "v4"));
		handshake_guess = null;
		if (handshake === "v5") await protocol_fetched; //Ensure that we have the enumerations available
		const auth = await send_request("GetAuthRequired");
		if (auth.authRequired || auth.authentication) {
			const authinfo = auth.authentication || auth;
			const hash = forge_sha256(pwd + authinfo.salt);
			const resp = forge_sha256(hash + authinfo.challenge);
			try {
				if (handshake === "v5") await send_request("Identified", {rpcVersion: 1, authentication: resp}, "Identify");
				else await send_request("Authenticate", {auth: resp}); //Will throw on auth failure
			} catch (e) {
				state.last_connect_error = ""+e;
				repaint();
				return;
			}
		}
		const ver = await send_request("GetVersion");
		const obsver = ver[v4v5("obs-studio-version", "obsVersion")];
		console.info("Running on OBS " + obsver + " and obs-websocket " + ver[v4v5("obs-websocket-version", "obsWebSocketVersion")]);
		if (handshake === "v4") try {
			(await send_request("GetSourceTypesList"))
				.types.forEach(type => sourcetypes[type.typeId] = type);
		} catch (err) {} //If we can't get the source types, don't bother. It's a nice-to-have only.
		//else (await send_request("GetInputKindList")).inputKinds.forEach( //Currently there's no capabilities on the input kinds
		if (obsver >= "4.6.0") {
			const vidinfo = await send_request(v4v5("GetVideoInfo", "GetVideoSettings"));
			canvasx = vidinfo.baseWidth; canvasy = vidinfo.baseHeight;
		}
		connected = true;
		rerender();
		full_update();
		//Would be nice to know which messages we need and which are unnecessary, but whatever.
		if (handshake === "v4") {
			const status = await send_request("GetStreamingStatus");
			state.status.stream = status.streaming ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED";
			state.status.record = status.recording ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED";
		} else {
			const strm = await send_request("GetStreamStatus");
			state.status.stream = strm.outputActive ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED";
			const reco = await send_request("GetRecordStatus");
			state.status.record = reco.outputActive ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED";
		}
		repaint();
	}
	socket.onmessage = (ev) => {
		const data = JSON.parse(ev.data);
		if (handshake_guess && data.op !== undefined && data.d) handshake_guess(handshake = "v5");
		if (handshake === "v5") {
			const opcode = obsenum.WebSocketOpCode[data.op]; //Textual version
			let ret = data.d, fail = 0;
			if (opcode === "Hello") hello_msg = data.d;
			let id = responseids[opcode];
			if (id) delete responseids[opcode];
			else if (opcode === "RequestResponse") {
				id = data.d.requestId;
				if (data.d.requestStatus.result) ret = data.d.responseData;
				else fail = 1; //Return the full raw data.d dump
			}
			else if (opcode === "RequestBatchResponse") [id, ret] = [data.d.requestId, data.d.results];
			else if (opcode === "Event") fire_event(data.d.eventType, data.d.eventData);
			if (pending[id]) {
				pending[id][fail](ret);
				delete pending[id];
			}
			return;
		}
		if (data["update-type"]) return fire_event(data["update-type"], data);
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
	socket.onclose = e => {
		state.last_connect_error = connected ? "Connection closed by OBS" : "Couldn't connect";
		if (e.reason) state.last_connect_error += ": " + e.reason;
		else if (!connected) state.last_connect_error += " (check IP and port)";
		connected = false;
		rerender();
	};
}
rerender();
//Hack and future feature: A saved connection URI to automatically connect to.
//It may be worth having a "remember password" feature that uses this. Alternatively,
//an explicit "Connect to this OBS every time" after connection may be useful too.
const hash = (window.location.hash || "#").slice(1) || localStorage.getItem("obs-remote-autoconnect");
if (hash) {history.replaceState(null, "", location.pathname + location.search); parse_uri(hash); setup();}
else {build_uri(); repaint();}
on("submit", "#connectform", e => {e.preventDefault(); setup();});
