#!/bin/bash
# Setup script for Scene Sense GPU video generation server
# Run this on the GPU Droplet after SSH-ing in

set -e

echo "=== Scene Sense GPU Server Setup ==="

# Update system
apt-get update -y
apt-get install -y python3-pip python3-venv ffmpeg

# Create virtual environment
python3 -m venv /opt/scene-sense-venv
source /opt/scene-sense-venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r /opt/scene-sense/requirements.txt

# Pre-download the model (takes a few minutes)
echo "Downloading Stable Video Diffusion model..."
python3 -c "
from diffusers import StableVideoDiffusionPipeline
import torch
pipe = StableVideoDiffusionPipeline.from_pretrained(
    'stabilityai/stable-video-diffusion-img2vid-xt',
    torch_dtype=torch.float16,
    variant='fp16',
)
print('Model downloaded successfully!')
"

echo "=== Setup complete! ==="
echo "Start the server with:"
echo "  source /opt/scene-sense-venv/bin/activate"
echo "  cd /opt/scene-sense && uvicorn server:app --host 0.0.0.0 --port 8000"
