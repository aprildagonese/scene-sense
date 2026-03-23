"""
Scene Sense — Image-to-Video GPU Server
Runs Stable Video Diffusion (SVD) on a DigitalOcean GPU Droplet.
Accepts an image, returns a short animated video.
"""

import io
import os
import tempfile
import torch
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from PIL import Image
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import export_to_video

app = FastAPI()

# Load model at startup
print("Loading Stable Video Diffusion pipeline...")
pipe = StableVideoDiffusionPipeline.from_pretrained(
    "stabilityai/stable-video-diffusion-img2vid-xt",
    torch_dtype=torch.float16,
    variant="fp16",
)
pipe.to("cuda")
# Enable memory optimizations for 20GB VRAM
pipe.enable_model_cpu_offload()
print("Model loaded and ready!")


@app.get("/health")
def health():
    return {"status": "ok", "model": "stable-video-diffusion-img2vid-xt"}


@app.post("/generate")
async def generate_video(
    image: UploadFile = File(...),
    num_frames: int = Form(25),
    fps: int = Form(7),
    motion_bucket_id: int = Form(127),
    noise_aug_strength: float = Form(0.02),
):
    """
    Generate a video from an input image using SVD.

    - image: Input image file (JPEG/PNG)
    - num_frames: Number of frames to generate (default 25)
    - fps: Frames per second for output (default 7)
    - motion_bucket_id: Controls amount of motion (1-255, higher = more motion)
    - noise_aug_strength: Noise augmentation (lower = closer to input)
    """
    # Read and prepare input image
    image_bytes = await image.read()
    input_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # SVD expects 1024x576
    input_image = input_image.resize((1024, 576))

    # Generate video frames
    with torch.no_grad():
        frames = pipe(
            input_image,
            num_frames=num_frames,
            decode_chunk_size=4,
            motion_bucket_id=motion_bucket_id,
            noise_aug_strength=noise_aug_strength,
        ).frames[0]

    # Export to video file
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name

    export_to_video(frames, tmp_path, fps=fps)

    # Stream the video back
    def iterfile():
        with open(tmp_path, "rb") as f:
            yield from f
        os.unlink(tmp_path)

    return StreamingResponse(
        iterfile(),
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=generated.mp4"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
