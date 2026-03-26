import usb_cdc

# Enable both console (for debugging) and data (for companion app)
usb_cdc.enable(console=True, data=True)
