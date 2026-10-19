"""Speech to text for BOKRA voice notes, on this PC (free, nothing leaves the machine).

Uses faster-whisper (pip install faster-whisper). The model lives on F: because C: is nearly full:
  BOKRA_WHISPER_MODEL   default large-v3-turbo (good with Egyptian Arabic, ~1.6 GB)
  BOKRA_MODELS_DIR      default F:/bokra-models
  BOKRA_WHISPER_DEVICE  default cpu (int8). "cuda" to try the GPU.

  python tools/listen.py some-recording.webm      prints the text (for testing)
"""
import os
import pathlib
import shutil
import subprocess
import sys

MODEL = os.environ.get("BOKRA_WHISPER_MODEL", "large-v3-turbo")
MODELS_DIR = os.environ.get("BOKRA_MODELS_DIR") or ("F:/bokra-models" if pathlib.Path("F:/").exists() else str(pathlib.Path(__file__).resolve().parent.parent / ".models"))
DEVICE = os.environ.get("BOKRA_WHISPER_DEVICE", "cpu")
# words he actually says, so Whisper spells them the way the app knows them
PROMPT = "قريت قرآن، صليت العصر، ذاكرت، رحت الجيم، العيادة، الشيفت، صرفت جنيه، فكرني بكرة."

_model = None


def model():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise SystemExit("faster-whisper مش متسطب: pip install faster-whisper")
        compute = "int8_float16" if DEVICE == "cuda" else "int8"
        _model = WhisperModel(MODEL, device=DEVICE, compute_type=compute, download_root=MODELS_DIR,
                              cpu_threads=max(1, (os.cpu_count() or 4) - 1))
    return _model


def load(path):
    """Decode with ffmpeg (16 kHz mono float): works for the phone's webm/opus and doesn't depend on PyAV's version."""
    ff = shutil.which("ffmpeg")
    if not ff:
        return str(path)  # let faster-whisper decode it itself
    import numpy as np
    raw = subprocess.run([ff, "-nostdin", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def transcribe(path):
    """Returns (text, seconds of audio)."""
    segments, info = model().transcribe(
        load(path), language="ar", beam_size=5, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700}, initial_prompt=PROMPT, condition_on_previous_text=False,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return text, round(info.duration or 0)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    t, d = transcribe(sys.argv[1])
    print(f"[{d}s] {t}")
