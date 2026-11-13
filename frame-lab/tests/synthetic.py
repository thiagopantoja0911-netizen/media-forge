#!/usr/bin/env python3
"""Synthetic end-to-end test: every reference frame, subpixel object movement, renderer alignment."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import cv2
import numpy as np

here=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);proj=root/"project";proj.mkdir()
    src=proj/"reference.mp4"
    writer=cv2.VideoWriter(str(src),cv2.VideoWriter_fourcc(*"mp4v"),30,(192,108))
    assert writer.isOpened(), "VideoWriter mp4v unavailable"
    for i in range(13):
        img=np.zeros((108,192,3),dtype=np.uint8)
        # Texture is essential for an identifiable independently moving object.
        cv2.rectangle(img,(38,28),(95,69),(0,40,190),-1)
        for y in range(29,68,5):
            cv2.line(img,(40,y),(94,y),(220,80,120),1)
        for x in range(41,95,6):
            cv2.circle(img,(x,43),1,(250,250,250),-1)
        mat=np.float32([[1.,0.,i*.44],[0.,1.,i*.24]])
        img=cv2.warpAffine(img,mat,(192,108),flags=cv2.INTER_LINEAR)
        writer.write(img)
    writer.release()
    (proj/"objects.json").write_text(json.dumps({"objects":[{
        "id":"card","label":"Animated card","x":38,"y":28,"w":58,"h":42,"startFrame":0
    }]}))
    output=proj/"results"
    script=here/"analyze.py"
    cmd=[sys.executable,str(script),"--reference",str(src),
         "--render",str(src),"--output",str(output)]
    result=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
    assert result.returncode==0,(result.stdout,result.stderr)
    data=json.loads((output/"report.json").read_text())
    assert data["reference"]["frameCount"]==13
    assert data["render"]["frameCount"]==13
    assert len(data["comparison"])==13
    assert len(list((output/"frames_reference").glob("*.webp")))==13
    assert len(list((output/"frames_flow").glob("*.webp")))==13
    assert len(list((output/"frames_diff").glob("*.webp")))==13
    tracks=[x["objects"][0] for x in data["reference"]["frames"][1:]]
    assert len(tracks)==12
    assert any(abs(x["dx"])>.04 for x in tracks),"Subpixel displacement not detected"
    assert all("kinematics" in x for x in tracks)
    assert "velocity_x_px_s" in tracks[0]["kinematics"]
    assert "jerk_x_px_s3" in tracks[0]["kinematics"]
    # A known identical compressed source should produce identical extracted pairs.
    assert max(x["maeRgb"] for x in data["comparison"])<1.0
    assert data["reference"]["frames"][2]["regions"] is not None
    assert data["reference"]["frames"][2]["subpixel_motion_fraction"] >=0
    print("Frame Lab QA PASS: 13/13 source frames + 13/13 render frames; subpixel object tracking; motion curves; 13 comparisons")
