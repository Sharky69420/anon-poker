import struct, zlib, io, os, random
from PIL import Image
random.seed(1)
def img(w=400,h=300):
    im=Image.new('RGB',(w,h));px=im.load()
    for x in range(w):
        for y in range(h): px[x,y]=((x*255)//w,(y*255)//h,(x+y)%256)
    return im
def save(name,data): open(name,'wb').write(data)
def enc(im,fmt,**k):
    b=io.BytesIO();im.save(b,fmt,**k);return b.getvalue()
png=enc(img(),'PNG'); jpg=enc(img(),'JPEG',quality=85); webp=enc(img(),'WEBP',quality=80)
save('ok.png',png);save('ok.jpg',jpg);save('ok.webp',webp)
# exif marker (harmless text) that must NOT survive
ex=Image.Exif();ex[0x010E]='SECRET-MARKER-98765';ex[0x013B]='ARTIST-MARKER-4321'
save('ok-exif.jpg',enc(img(),'JPEG',quality=85,exif=ex))
# hostile
save('evil-svg.svg',b'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>')
save('evil-svg-as.png',b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
save('evil-html.jpg',b'<!DOCTYPE html><html><script>alert(1)</script></html>')
save('evil-png-trailer.png',png+b'<script>alert(1)</script>')
save('evil-jpg-trailer.jpg',jpg+b'<?php system($_GET[0]); ?>')
save('evil-zip-trailer.jpg',jpg+b'PK\x03\x04'+b'\x00'*40)
# valid PNG with a script inside a tEXt chunk (valid CRC)
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
i=png.index(b'IDAT')-4
save('evil-png-text.png',png[:i]+chunk(b'tEXt',b'Comment\x00<script>alert(1)</script>')+png[i:])
# JPEG with script in a COM segment (structure valid)
com=b'<script>alert(1)</script>'
save('evil-jpg-com.jpg',jpg[:2]+b'\xff\xfe'+struct.pack('>H',len(com)+2)+com+jpg[2:])
# UTF-16 script in COM
com16='<script>alert(1)</script>'.encode('utf-16-le')
save('evil-jpg-utf16.jpg',jpg[:2]+b'\xff\xfe'+struct.pack('>H',len(com16)+2)+com16+jpg[2:])
# bad CRC
b=bytearray(png);b[40]^=0xff;save('bad-crc.png',bytes(b))
save('truncated.jpg',jpg[:len(jpg)//2])
# bomb: header claims 30000x30000, valid CRC, tiny IDAT
ihdr=struct.pack('>IIBBBBB',30000,30000,8,2,0,0,0)
idat=zlib.compress(b'\x00'*10)
save('bomb.png',b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',ihdr)+chunk(b'IDAT',idat)+chunk(b'IEND',b''))
save('tiny.png',enc(img(20,20),'PNG'))
save('empty.png',b'')
random.seed(2);big=os.urandom(10*1024*1024+10);save('toobig.png',b'\x89PNG\r\n\x1a\n'+big)
save('gif.png',b'GIF89a'+b'\x00'*100)
save('pe.jpg',b'MZ'+b'\x90'*500)
# animated webp
frames=[img(100,100),Image.new('RGB',(100,100),(255,0,0))]
b=io.BytesIO();frames[0].save(b,'WEBP',save_all=True,append_images=frames[1:],duration=100);save('anim.webp',b.getvalue())
# big valid photo-like (noisy) 4000x3000 jpeg to test downscale/size
import numpy as np
a=(np.random.RandomState(3).rand(3000,4000,3)*255).astype('uint8')
save('big-noise.jpg',enc(Image.fromarray(a),'JPEG',quality=70))
save('evil-png-trailer-quiet.png',png+bytes(range(1,200)))
save('evil-jpg-trailer-quiet.jpg',jpg+bytes(range(1,200)))
big=Image.new('RGB',(9000,6000),(10,80,40));save('huge-valid.png',enc(big,'PNG',compress_level=9))
n=(np.random.RandomState(5).rand(2400,2400,3)*255).astype('uint8');save('toobig-valid.png',enc(Image.fromarray(n),'PNG',compress_level=0))
b=bytearray(png);b[-1]^=0xff;save('bad-crc-iend.png',bytes(b))
b=bytearray(png);b[29]^=0xff;save('bad-crc-ihdr.png',bytes(b))
print(sorted(os.listdir('.')))
