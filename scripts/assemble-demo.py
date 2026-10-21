"""Create a six-minute narrated development walkthrough from actual app captures.
This is a screenshot presentation, not a continuous screen recording or live AI demo.
"""
from pathlib import Path
import json, sys, wave, subprocess
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'outputs/media-runtime'))
import imageio_ffmpeg
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
scenes=json.loads((ROOT/'docs/开发版视频旁白.json').read_text(encoding='utf-8'))
clips=ROOT/'outputs/demo'
durations=[]
for scene in scenes:
    with wave.open(str(clips/(scene['id']+'.wav'))) as audio:
        durations.append(audio.getnframes()/audio.getframerate())
speed=sum(durations)/342
assert .5<=speed<=2, f'Unexpected narration speed ratio {speed}'
for scene,duration in zip(scenes,durations):
    stem=scene['id']; seconds=duration/speed+1.5
    args=[ffmpeg,'-y','-hide_banner','-loglevel','error','-loop','1','-framerate','12','-i',str(clips/(stem+'.png')),
          '-i',str(clips/(stem+'.wav')),'-t',str(seconds),'-vf','scale=1920:1080,format=yuv420p',
          '-af',f'atempo={speed},apad','-c:v','libx264','-preset','veryfast','-crf','24',
          '-c:a','aac','-b:a','128k','-ar','48000','-r','12',str(clips/(stem+'.mp4'))]
    subprocess.run(args,check=True)
    print('Rendered scene '+stem,flush=True)
listing=clips/'concat.txt'
listing.write_text('\n'.join(f"file '{s['id']}.mp4'" for s in scenes),encoding='utf-8')
target=ROOT/'output/video/知序-功能演示-开发版.mp4';target.parent.mkdir(parents=True,exist_ok=True)
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(target)],check=True)
(ROOT/'output/video/说明.txt').write_text('开发版：实际应用页面截图与系统中文语音合成旁白组成，约6分钟，1920x1080。不是连续录屏，未调用云端模型。正式参赛前需要真实API联调、真实AI能力演示和队员本人讲解。',encoding='utf-8')
metadata={'width':1920,'height':1080,'targetSeconds':360,'speechRateRatio':speed,'type':'actual UI screenshots + synthetic Mandarin narration','liveModel':False,'file':target.name}
(ROOT/'output/video/metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
print('Video ready: '+str(target))
