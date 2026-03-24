#!/bin/bash
# Setup script for Scene Sense MusicGen server
# Run this on the GPU Droplet after SSH-ing in

set -e

echo "=== Scene Sense MusicGen Server Setup ==="

# Update system
apt-get update -y
apt-get install -y python3-pip python3-venv

# Create virtual environment
python3 -m venv /opt/scene-sense-venv
source /opt/scene-sense-venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r /opt/scene-sense/requirements.txt

# Pre-download the model
echo "Downloading MusicGen model..."
python3 -c "
from transformers import AutoProcessor, MusicgenForConditionalGeneration
processor = AutoProcessor.from_pretrained('facebook/musicgen-medium')
model = MusicgenForConditionalGeneration.from_pretrained('facebook/musicgen-medium')
print('MusicGen model downloaded successfully!')
"

echo "=== Setup complete! ==="
echo "Start the server with:"
echo "  source /opt/scene-sense-venv/bin/activate"
echo "  cd /opt/scene-sense && uvicorn server:app --host 0.0.0.0 --port 8000"
