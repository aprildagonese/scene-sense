"""
MusicGen server for Scene Sense — runs on DigitalOcean GPU Droplet.
Generates promo-style background music from text prompts using
Meta's MusicGen (open-weight, MIT license).
"""

import io
import torch
import scipy.io.wavfile
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()

# Global model reference
model = None
processor = None


@app.on_event("startup")
def load_model():
    global model, processor
    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    print("Loading MusicGen model...")
    model_id = "facebook/musicgen-medium"
    processor = AutoProcessor.from_pretrained(model_id)
    model = MusicgenForConditionalGeneration.from_pretrained(model_id)

    if torch.cuda.is_available():
        model = model.to("cuda")
        print(f"MusicGen loaded on GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("WARNING: CUDA not available, running on CPU (will be slow)")

    print("MusicGen ready!")


class MusicRequest(BaseModel):
    prompt: str
    duration_seconds: float = 12.0


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": "facebook/musicgen-medium",
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
    }


@app.post("/generate")
def generate_music(req: MusicRequest):
    """Generate music from a text prompt. Returns a WAV file."""
    # MusicGen generates at 32kHz
    sample_rate = 32000
    max_new_tokens = int(req.duration_seconds * 50)  # ~50 tokens per second

    inputs = processor(
        text=[req.prompt],
        padding=True,
        return_tensors="pt",
    )

    if torch.cuda.is_available():
        inputs = {k: v.to("cuda") for k, v in inputs.items()}

    with torch.no_grad():
        audio_values = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            guidance_scale=3.0,
        )

    # Convert to numpy and write WAV
    audio = audio_values[0, 0].cpu().numpy()

    buf = io.BytesIO()
    scipy.io.wavfile.write(buf, sample_rate, audio)
    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type="audio/wav",
        headers={"Content-Disposition": "attachment; filename=music.wav"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
