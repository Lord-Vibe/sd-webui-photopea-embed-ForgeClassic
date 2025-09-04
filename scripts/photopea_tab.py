import gradio as gr
from modules import script_callbacks
from modules.shared import opts
from modules import extensions

# Handy constants
PHOTOPEA_MAIN_URL = "https://www.photopea.com/"
PHOTOPEA_IFRAME_ID = "webui-photopea-iframe"
PHOTOPEA_IFRAME_HEIGHT = 768
PHOTOPEA_IFRAME_WIDTH = "100%"
PHOTOPEA_IFRAME_LOADED_EVENT = "onPhotopeaLoaded"


# Adds the "Photopea" tab to the WebUI
def on_ui_tabs():
    with gr.Blocks(analytics_enabled=False) as photopea_tab:
        # Check if Controlnet is installed and enabled in settings, so we can show or hide the "Send to Controlnet" buttons.
        controlnet_exists = False
        for extension in extensions.active():
            if "controlnet" in extension.name:
                controlnet_exists = True
                break

        with gr.Row():
            # Add an iframe with Photopea directly in the tab.
            gr.HTML(
                f"""<iframe id="{PHOTOPEA_IFRAME_ID}" 
                src = "{PHOTOPEA_MAIN_URL}{get_photopea_url_params()}" 
                width = "{PHOTOPEA_IFRAME_WIDTH}" 
                height = "{PHOTOPEA_IFRAME_HEIGHT}"
                onload = "{PHOTOPEA_IFRAME_LOADED_EVENT}(this)">"""
            )
        with gr.Row():
            gr.Checkbox(
                label="Active Layer Only",
                info="If true, instead of sending the flattened image, will send just the currently selected layer.",
                elem_id="photopea-use-active-layer-only",
            )
            # Controlnet might have more than one model tab (set by the 'control_net_max_models_num' setting).
            try:
                num_controlnet_models = opts.control_net_unit_count
            except:
                num_controlnet_models = 1

            select_target_index = gr.Dropdown(
                [str(i) for i in range(num_controlnet_models)],
                label="ControlNet model index",
                value="0",
                interactive=True,
                visible=num_controlnet_models > 1,
            )

            # Just create the size slider here. We'll modify the page via the js bindings.
            gr.Slider(
                minimum=512,
                maximum=2160,
                value=768,
                step=10,
                label="iFrame height",
                interactive=True,
                elem_id="photopeaIframeSlider",
            )

        with gr.Row():
            with gr.Column():
                gr.HTML(
                    """<b>Controlnet extension not found!</b> Either <a href="https://github.com/Mikubill/sd-webui-controlnet" target="_blank">install it</a>, or activate it under Settings.""",
                    visible=not controlnet_exists,
                )
                send_t2i_cn = gr.Button(
                    value="Send to txt2img ControlNet", visible=controlnet_exists
                )
                send_extras = gr.Button(value="Send to Extras")

            with gr.Column():
                send_i2i = gr.Button(value="Send to img2img")
                send_i2i_cn = gr.Button(
                    value="Send to img2img ControlNet", visible=controlnet_exists
                )
            with gr.Column():
                send_selection_inpaint = gr.Button(value="Inpaint selection")
            
            with gr.Column():
                send_mask_t2i_cn = gr.Button(
                    value="Send image and mask to txt2img ControlNet", visible=controlnet_exists
                )
                send_mask_i2i_cn = gr.Button(
                    value="Send image and mask to img2img ControlNet", visible=controlnet_exists
                )

        with gr.Row():
            gr.HTML(
                """<font size="small"><p align="right">
                When sending an image to img2img Controlnet, make sure that "Upload Independent Control Image" is checked.<br>
                When using the "Send image and mask to Controlnet" function, make sure that the "Use Mask" box is checked.<br>
                Image and mask will not appear in the Controlnet section until you do an action that changes the UI in any way. (Ex: Changing the Controlnet tab, resizing the window, etc.)<br>
                Consider supporting Photopea by <a href="https://www.photopea.com/api/accounts" target="_blank">going Premium</a>!
                </font></p>"""
            )
        
        send_t2i_cn.click(
            fn=None,
            inputs=[select_target_index],
            outputs=None,
            _js="(i) => {getAndSendImageToWebUITab('txt2img', true, i)}",
        )
        send_extras.click(
            fn=None,
            inputs=[select_target_index],
            outputs=None,
            _js="(i) => {getAndSendImageToWebUITab('extras', false, i)}",
        )
        send_i2i.click(
            fn=None,
            inputs=[select_target_index],
            outputs=None,
            _js="(i) => {getAndSendImageToWebUITab('img2img', false, i)}",
        )
        send_i2i_cn.click(
            fn=None,
            inputs=[select_target_index],
            outputs=None,
            _js="(i) => {getAndSendImageToWebUITab('img2img', true, i)}",
        )
        send_selection_inpaint.click(
            fn=None,
            inputs=[],
            outputs=None,
            _js="() => {sendImageWithMaskSelectionToWebUi()}",
        )
        
        send_mask_t2i_cn.click(
            fn=None,
            inputs=[select_target_index],
            outputs=None,
            _js="(i) => {sendImageAndMaskToControlNet('txt2img', i)}"
        )
        send_mask_i2i_cn.click(
            fn=None,
            inputs=[select_target_index],
            outputs=None,
            _js="(i) => {sendImageAndMaskToControlNet('img2img', i)}"
        )

    return [(photopea_tab, "Photopea", "photopea_embed")]


def get_photopea_url_params():
    return "#%7B%22resources%22:%5B%22data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAQMAAADOtka5AAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAANQTFRF////p8QbyAAAADZJREFUeJztwQEBAAAAgiD/r25IQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfBuCAAAB0niJ8AAAAABJRU5ErkJggg==%22%5D%7D"


script_callbacks.on_ui_tabs(on_ui_tabs)