goog.require('kettos.live');

/*
 * Written by Nathan Green
 * Updated on 08/11/2023
 * 
 * @authors: Nathan Green <nathangreen.me@gmail.com>
 */

/* NOTES -----------------------------------------------------------------------
    08/11/2023
    Use pseudo:after to display the loading icon so that an image 
    file is not required by designer
    ----------------------------------------------------------------------------
*/

/* ------------------------------- iFrame Button -------------------------------
 *******************************************************************************
 * 	Click-able image that behaves like a button.  This widget can invoke a
 * 	JavaScript function,change a register value, or act as a hyperlink
 *******************************************************************************/
function updateiFrameContent(name, src) {
    var src = designer.common.makeURL(src);
    var thisFrame = document.getElementById(id);
    thisFrame.setAttribute('src', src);
}

kettos.live.iFrame = function(div) {
    var container = div.firstChild;
    var iframe = container.firstChild;
    var href = container.getAttribute('data-href');
    var src = designer.common.makeURL(href);
    
    if (src === undefined) {return}
    iframe.src = src;
}


kettos.live.iFrameButton = function(div) {
    var button = div.firstChild;
    var name = div.getAttribute('data-target');
    var target = document.getElementsByName(name)[0].getElementsByTagName("iframe")[0]; //first element of given name
    var container = target.parentNode;
    var href = div.getAttribute('data-href');
    var anim = div.getAttribute("data-animation");
    var src = designer.common.makeURL(href);
    var buffer = 100;
    var s = "0.5s";
    var ms = parseFloat(s) * 1000;
    const LOADING = "loading";

    document.body.style.setProperty('--t', s)

    goog.events.listen(button, "click", function() {
        let animationIn, animationOut;
        //let loadingIcon = document.getElementsByClassName('loading-icon')[0];
        //loadingIcon != undefined ? loadingIcon.style.visibility = "visible" : false; // 08/12/2023 - replaced by pseudo-element

        // ignore new request if animating or if source does not change
        if (container.getAttribute("data-animating") === "true") {
            return;
        }

        makeActive(button)

        if (target.src == src) {
            target.setAttribute("data-caller-id", button.parentNode.id);
            return;
        }

        container.setAttribute("data-animating", "true");
        container.classList.add(LOADING);

        //Switch statement must be after 'click' because animation might change depending on button location (e.g., "Smart")
        switch (anim) {
            case "none":
                animationOut = "";
                animationIn = "";
                break;
            case "smart":
                let prevButton = document.getElementById(target.getAttribute("data-caller-id")) || button;

                //NEW - 11.09.2021
                let prevWidget = prevButton.parentWidget;
                let thisWidget = button.parentWidget;

                let sameParent = prevWidget.parentContainer === thisWidget.parentContainer ? true : false;


                if (thisWidget.offsetLeft > prevWidget.offsetLeft && sameParent) { //slide left
                    animationOut = "out-to-left";
                    animationIn = animationIn = "in-from-right";
                } else if (thisWidget.offsetLeft < prevWidget.offsetLeft && sameParent) { //slide right
                    animationOut = "out-to-right";
                    animationIn = animationIn = "in-from-left";
                } else if (thisWidget.offsetTop > prevWidget.offsetTop && sameParent) { //slide up
                    animationOut = "out-to-above";
                    animationIn = animationIn = "in-from-below";
                } else if (thisWidget.offsetTop < prevWidget.offsetTop && sameParent) { //slide down
                    animationOut = "out-to-below";
                    animationIn = animationIn = "in-from-above";
                } else { // different container or no position change : fade only
                    animationOut = "fade-out";
                    animationIn = "fade-in";
                }
                break;
            case "fadeInOut":
                animationOut = "fade-out";
                animationIn = "fade-in";
                break;
            case "slideLeft":
                animationOut = "out-to-left";
                animationIn = animationIn = "in-from-right";
                break;
            case "slideRight":
                animationOut = "out-to-right";
                animationIn = animationIn = "in-from-left";
                break;
            case "slideUp":
                animationOut = "out-to-above";
                animationIn = animationIn = "in-from-below";
                break;
            case "slideDown":
                animationOut = "out-to-below";
                animationIn = animationIn = "in-from-above";
                break;
            default:
                animationOut = "fade-out";
                animationIn = "fade-in";
        }

        //Identify caller (used for Smart animation)
        target.setAttribute("data-caller-id", button.parentNode.id)

        //Animate OUT
        target.classList.add(animationOut);

        //Animate IN
        setTimeout(function() {
            target.classList.remove(animationOut)
            target.style.visibility = "hidden";
            target.classList.remove(animationOut)

            //Update Src
            target.src = src;

            //Delay until Loaded
            var startTime = Date.now();
            goog.events.listenOnce(target, "load", function() {
                let elapsedTime = Date.now() - startTime;
                console.log(`Load time: ${elapsedTime} ms →`, href); // 08/11/2023 - changed to "href" from "src"

                //Animate IN
                target.classList.add(animationIn)
                target.style.visibility = "visible";
                
                
                //Remove Animate IN
                setTimeout(function() {
                    target.classList.remove(animationIn)
                    container.setAttribute("data-animating", "false");
                    container.classList.remove(LOADING);
                    // loadingIcon != undefined ? loadingIcon.style.visibility = "hidden" : false;  //08/12/2023 - replaced by pseudo-element
                }, ms + buffer)
            })
        }, ms - buffer); //must be less than animation time to prevent flicker
    })
}

const getParentByClassName = function(el, className, maxLayers) {
    var validLayer = true;
    var searching = true;
    var layer = 0;

    do {
        layer++;
        if (typeof(maxLayers) === "number") {
            validLayer = layer <= maxLayers ? true : false;
        } else {
            validLayer = true;
        }

        el = el.parentNode;
        searching = el.classList.contains(className) ? false : true;

        if (el.nodeName === "BODY") {
            return null;
        }

    } while (searching)

    return el;
}

function makeActive(el) {
    let container = el.parentContainer;
    let widget = el.parentWidget;
    let widget_;

    for (let i = 0; i < container.children.length; i++) {
        widget_ = container.children[i];

        widget !== widget_ ? widget_.classList.remove("active") : widget_.classList.add("active");
    }
}

function makeDefaultSelection() {
    var defaultElements = document.getElementsByClassName("default-select");

    for (let i = 0; i < defaultElements.length; i++) {
        var el = defaultElements[i].firstChild;
        el.click();
    }
}