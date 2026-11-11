# Third-party runtime notices

MediaForge's Windows render worker installs the following pinned packages in
\`desktop/worker/node_modules\` (not in the Hostinger web-server dependency set):

- \`ffmpeg-static@5.3.0\` — package license: GPL-3.0-or-later. The package downloads
  a platform-specific FFmpeg binary during installation.
- \`@derhuerst/ffprobe-static@5.3.0\` — package license: GPL-3.0-or-later.

The worker runs these programs as separate command-line processes. Preserve the
upstream license and notices when redistributing the worker installer or binaries.
Review the exact license files shipped by the installed package versions before
public distribution. The binaries are not committed to this repository.
