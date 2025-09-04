/* Setup and navigation */
var photopeaWindow = null;
var photopeaIframe = null;

// =================================================================================
// START: Photopea Scripts
// =================================================================================

const SCRIPT_GET_ALL_ART_LAYERS = `
function getAllArtLayers (document, layerCollection){
    for (var i = 0; i < document.layers.length; i++){
        var currentLayer = document.layers[i];
        if (currentLayer.typename === "ArtLayer"){
            layerCollection.push(currentLayer);
        } else {
            getAllArtLayers(currentLayer, layerCollection);
        }
    }
    return layerCollection;
}`;

const SCRIPT_EXPORT_SELECTED_LAYER_ONLY = SCRIPT_GET_ALL_ART_LAYERS + `
function exportSelectedLayerOnly() {
    var allLayers = []
    allLayers = getAllArtLayers(app.activeDocument, allLayers);
    var layerStates = []
    for (var i = 0; i < allLayers.length; i++) {
        layerStates.push(allLayers[i].visible)
        allLayers[i].visible = allLayers[i] == app.activeDocument.activeLayer
    }
    app.activeDocument.saveToOE("JPG");
    for (var i = 0; i < allLayers.length; i++) {
        allLayers[i].visible = layerStates[i]
    }
}
exportSelectedLayerOnly();`;

const SCRIPT_CREATE_MASK_FROM_SELECTION = `
function createMaskFromSelection() {
    if (app.activeDocument.selection === null) {
        app.echo("No selection!");
        return;
    }
    var newLayer = app.activeDocument.artLayers.add();
    newLayer.name = "TempMaskLayer";
    app.activeDocument.selection.invert();
    var color = new SolidColor();
    color.rgb.red = 0;
    color.rgb.green = 0;
    color.rgb.blue = 0;
    app.activeDocument.selection.fill(color);
    color.rgb.red = 255;
    color.rgb.green = 255;
    color.rgb.blue = 255;
    app.activeDocument.selection.invert();
    app.activeDocument.selection.fill(color);
}
createMaskFromSelection();`;

const SCRIPT_SELECTION_EXISTS = `
app.echoToOE(app.activeDocument.selection.bounds != null);
`;

const SCRIPT_GET_ACTIVE_DOCUMENT_SIZE = `
app.echoToOE(app.activeDocument.width + "," + app.activeDocument.height);
`;


// =================================================================================
// START: Robust Photopea Communication Handler
// =================================================================================

let photopeaMessageQueue = [];
let isPhotopeaListenerActive = false;

function setupPhotopeaListener() {
    if (isPhotopeaListenerActive) return;

    window.addEventListener("message", (event) => {
        if (event.source !== photopeaWindow) return;
        if (photopeaMessageQueue.length === 0) return;
        const currentHandler = photopeaMessageQueue[0];
        currentHandler(event.data);
    });

    isPhotopeaListenerActive = true;
}

async function postMessageToPhotopea(message) {
    setupPhotopeaListener();

    const request = new Promise((resolve, reject) => {
        let responses = [];
        const handler = (data) => {
            responses.push(data);
            if (data === "done") {
                photopeaMessageQueue.shift();
                resolve(responses);
            }
        };
        photopeaMessageQueue.push(handler);
    });

    photopeaWindow.postMessage(message, "*");
    return await request;
}

// =================================================================================
// END: Robust Photopea Communication Handler
// =================================================================================


function onPhotopeaLoaded(iframe) {
    console.log("Photopea iFrame loaded");
    photopeaWindow = iframe.contentWindow;
    photopeaIframe = iframe;

    createSendToPhotopeaButton("image_buttons_txt2img", window.txt2img_gallery);
    createSendToPhotopeaButton("image_buttons_img2img", window.img2img_gallery);
    createSendToPhotopeaButton("image_buttons_extras", window.extras_gallery);

    gradioApp().getElementById("photopeaIframeSlider").addEventListener('input', (event) => {
        const newHeight = parseInt(event.target.value);
        photopeaIframe.style.height = newHeight + 'px';
    });
}

function createSendToPhotopeaButton(queryId, gallery) {
    const existingButton = gradioApp().querySelector(`#${queryId} button`);
    if (!existingButton) return;
    const newButton = existingButton.cloneNode(true);
    newButton.style.display = "flex";
    newButton.id = `${queryId}_open_in_photopea`;
    newButton.title = "Send to Photopea"
    newButton.textContent = "\u{1F99C}";
    newButton.addEventListener("click", () => openImageInPhotopea(gallery));
    existingButton.parentNode.appendChild(newButton);
}

function goToPhotopeaTab() {
    const allButtons = gradioApp().querySelector('#tabs').querySelectorAll('button');
    photopeaTabButton = Array.from(allButtons).find(button => button.textContent.trim() === 'Photopea');
    if (photopeaTabButton) photopeaTabButton.click();
}

function goToImg2ImgInpaintUpload(onFinished) {
    switch_to_img2img();
    const img2imgdiv = gradioApp().getElementById("mode_img2img");

    waitForWebUiUpdate(img2imgdiv).then(() => {
        const allButtons = img2imgdiv.querySelectorAll("div.tab-nav > button");
        const inpaintButton =
            Array.from(allButtons).find(button => button.textContent.trim() === 'Inpaint upload');
        if (inpaintButton) {
            inpaintButton.click();
            waitForWebUiUpdate(img2imgdiv).then(() => {
                onFinished();
            });
        }
    });
}

function activeLayerOnly() {
    return gradioApp()
        .getElementById("photopea-use-active-layer-only")
        .querySelector("input[type=checkbox]").checked;
}

function openImageInPhotopea(originGallery) {
    var imageSizeMatches = true;
    const outgoingImg = originGallery.querySelectorAll("img")[0];
    goToPhotopeaTab();

    postMessageToPhotopea(SCRIPT_GET_ACTIVE_DOCUMENT_SIZE).then((response) => {
        const activeDocSize = response[0].split(",");
        if (outgoingImg.naturalWidth > activeDocSize[0] || 
            outgoingImg.naturalHeight > activeDocSize[1]) {
            imageSizeMatches = false;
        }

        blobTob64(outgoingImg.src, (imageData) => {
            postMessageToPhotopea(`app.open("${imageData}", null, ${imageSizeMatches});`, "*")
                .then(() => {
                    if (imageSizeMatches) {
                        postMessageToPhotopea(`app.activeDocument.activeLayer.rasterize();`, "*");
                    } else {
                        postMessageToPhotopea(
                            `alert("New document created as the image sent is bigger than the active document");`,
                            "*");
                    }
                });
        });
    });
}

function getAndSendImageToWebUITab(webUiTab, sendToControlnet, imageWidgetIndex) {
    const saveMessage = activeLayerOnly()
        ? SCRIPT_EXPORT_SELECTED_LAYER_ONLY
        : 'app.activeDocument.saveToOE("png");';

    postMessageToPhotopea(saveMessage)
        .then((resultArray) => {
            const base64Png = base64ArrayBuffer(resultArray[0]);
            sendImageToWebUi(
                webUiTab,
                sendToControlnet,
                imageWidgetIndex,
                b64toBlob(base64Png, "image/png"));
        });
}

function sendImageToWebUi(webUiTab, sendToControlNet, controlnetModelIndex, blob) {
    const file = new File([blob], "photopea_output.png")

    switch (webUiTab) {
        case "txt2img": switch_to_txt2img(); break;
        case "img2img": switch_to_img2img(); break;
        case "extras": switch_to_extras(); break;
    }

    if (sendToControlNet) {
        const tabId = webUiTab === "txt2img" ? "#txt2img_script_container" : "#img2img_script_container";
        const controlNetDiv = gradioApp().querySelector(tabId).querySelector("#controlnet");
        setImageOnControlNetInput(controlNetDiv, controlnetModelIndex, file, false);
    } else {
        const imageInput = gradioApp().getElementById(`mode_${webUiTab}`).querySelector("input[type='file']");
        setImageOnInput(imageInput, file);
    }
}

function sendImageWithMaskSelectionToWebUi() {
    postMessageToPhotopea(SCRIPT_SELECTION_EXISTS)
        .then((response) => {
            if (response[0] === false) {
                postMessageToPhotopea(`alert("No selection in active document!");`);
                return;
            }
            goToImg2ImgInpaintUpload(() => {
                postMessageToPhotopea(SCRIPT_CREATE_MASK_FROM_SELECTION).then(() => {
                    postMessageToPhotopea(SCRIPT_EXPORT_SELECTED_LAYER_ONLY).then((maskResultArray) => {
                        const base64Mask = base64ArrayBuffer(maskResultArray[0]);
                        const maskInput = gradioApp().getElementById("img_inpaint_mask").querySelector("input");
                        const maskBlob = b64toBlob(base64Mask, "image/png");
                        const maskFile = new File([maskBlob], "photopea_mask.png");
                        setImageOnInput(maskInput, maskFile);
                        postMessageToPhotopea(`app.activeDocument.activeLayer.remove();`).then(() => {
                            const saveMessage = activeLayerOnly()
                                ? SCRIPT_EXPORT_SELECTED_LAYER_ONLY
                                : 'app.activeDocument.saveToOE("png");';
                            postMessageToPhotopea(saveMessage).then((imageResultArray) => {
                                const base64Img = base64ArrayBuffer(imageResultArray[0]);
                                const baseImgInput = gradioApp().getElementById("img_inpaint_base").querySelector("input");
                                const imgBlob = b64toBlob(base64Img, "image/png");
                                const imgFile = new File([imgBlob], "photopea_image.png");
                                setImageOnInput(baseImgInput, imgFile);
                            });
                        });
                    });
                });
            });
        });
}

function sendImageAndMaskToControlNet(webUiTab, controlnetModelIndex) {
    postMessageToPhotopea(SCRIPT_SELECTION_EXISTS).then(response => {
        if (response[0] === false) {
            postMessageToPhotopea(`alert("No selection in active document to create a mask!");`);
            return;
        }

        if (webUiTab === 'txt2img') switch_to_txt2img();
        else if (webUiTab === 'img2img') switch_to_img2img();

        const tabId = webUiTab === "txt2img" ? "#txt2img_script_container" : "#img2img_script_container";
        const controlNetDiv = gradioApp().querySelector(tabId).querySelector("#controlnet");

        postMessageToPhotopea(SCRIPT_CREATE_MASK_FROM_SELECTION)
        .then(() => postMessageToPhotopea(SCRIPT_EXPORT_SELECTED_LAYER_ONLY))
        .then(maskResultArray => {
            const maskBlob = b64toBlob(base64ArrayBuffer(maskResultArray[0]), "image/png");
            const maskFile = new File([maskBlob], "photopea_mask.png");
            return setImageOnControlNetInput(controlNetDiv, controlnetModelIndex, maskFile, true);
        })
        .then(() => postMessageToPhotopea(`app.activeDocument.activeLayer.remove();`))
        .then(() => {
            const saveMessage = activeLayerOnly() ? SCRIPT_EXPORT_SELECTED_LAYER_ONLY : 'app.activeDocument.saveToOE("png");';
            return postMessageToPhotopea(saveMessage);
        })
        .then(imageResultArray => {
            const imageBlob = b64toBlob(base64ArrayBuffer(imageResultArray[0]), "image/png");
            const imageFile = new File([imageBlob], "photopea_image.png");
            return setImageOnControlNetInput(controlNetDiv, controlnetModelIndex, imageFile, false);
        })
        .catch(error => console.error("Error in sendImageAndMaskToControlNet chain:", error));
    });
}

function setImageOnControlNetInput(controlNetDiv, controlNetModelIndex, file, isMask = false) {
    return new Promise((resolve, reject) => {
        const isImg2Img = controlNetDiv.closest('#img2img_script_container') !== null;
        const tabPrefix = isImg2Img ? 'img2img' : 'txt2img';

        waitForWebUiUpdate(controlNetDiv).then(() => {
            const tabs = controlNetDiv.querySelectorAll("div.tab-nav > button");
            if (tabs && tabs.length > 1 && controlNetModelIndex < tabs.length) {
                tabs[controlNetModelIndex].click();
            }

            waitForWebUiUpdate(controlNetDiv).then(() => {
                const elemIdPrefix = `${tabPrefix}_controlnet_ControlNet-${controlNetModelIndex}`;
                const selector = isMask
                    ? `#${elemIdPrefix}_mask_image input[type='file']`
                    : `#${elemIdPrefix}_input_image input[type='file']`;
                
                const imageInput = controlNetDiv.querySelector(selector);

                if (imageInput) {
                    setImageOnInput(imageInput, file);
                    resolve();
                } else {
                    console.error(`ControlNet Error: Could not find the ${isMask ? 'mask' : 'image'} input element using selector: ${selector}. Please ensure the correct options are checked in the UI.`);
                    reject(`ControlNet Error: Could not find the ${isMask ? 'mask' : 'image'} input element.`);
                }
            });
        });
    });
}

// Reverted to the most basic version. The new help text instructs the user on how to refresh the UI.
function setImageOnInput(imageInput, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    imageInput.files = dt.files;
    const event = new Event('change', { 'bubbles': true, "composed": true });
    imageInput.dispatchEvent(event);
}

async function waitForWebUiUpdate(divToWatch) {
    const promise = new Promise((resolve, reject) => {
        const mutationConfig = { attributes: true, childList: true, subtree: true };
        const onMutationHappened = (mutationList, observer) => {
            observer.disconnect();
            resolve();
        }
        const observer = new MutationObserver(onMutationHappened);
        observer.observe(divToWatch, mutationConfig);
    });
    return await promise;
}