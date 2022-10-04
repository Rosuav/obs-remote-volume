//All the real code is in sections.js
import {render, startdrag} from "./sections.js";
set_content("main", render({type: "box", subtype: "vertical"}, "toolbox"));
on("dragstart", ".draggable", e => startdrag(e));
