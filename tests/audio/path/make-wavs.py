# Regenerate the real-voice test clips: Cloudflare Workers AI aura-1 TTS (speaker luna), pitched up ~12% (kid-like), slowed
# to kid pace, 48 kHz mono 16-bit WAV, 0.7 s pause between lines. Auth from cfenv.sh env (never printed).
# usage: cd tests/audio/rc && source /workspace/replit_migration_ux/cfenv.sh && python3 make-wavs.py t60 luna
import json, os, subprocess, sys, urllib.request
name, speaker = sys.argv[1], sys.argv[2]
acc, em, key = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_EMAIL"], os.environ["CLOUDFLARE_API_KEY"]
lines = [l.strip() for l in open(name + ".txt") if l.strip()]
parts = []
os.makedirs("tmp", exist_ok=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.7", "-c:a", "pcm_s16le", "tmp/sil.wav"], check=True)
for i, l in enumerate(lines):
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/@cf/deepgram/aura-1", data=json.dumps({"text": l, "speaker": speaker}).encode(),
        headers={"X-Auth-Email": em, "X-Auth-Key": key, "Content-Type": "application/json"})
    mp3 = f"tmp/{name}-{i}.mp3"; open(mp3, "wb").write(urllib.request.urlopen(req, timeout=60).read())
    wav = f"tmp/{name}-{i}.wav"
    # slightly higher pitch (kid-like), same speed; 48 kHz mono 16-bit
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-af", "aresample=48000,asetrate=53760,aresample=48000,atempo=0.735", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", wav], check=True)
    parts += [wav, "tmp/sil.wav"]
open("tmp/list.txt", "w").write("".join(f"file '{os.path.basename(p)}'\n" for p in parts))
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "tmp/list.txt", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", name + ".wav"], check=True)
print(name, subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", name + ".wav"], capture_output=True, text=True).stdout.strip(), "s")
