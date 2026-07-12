using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public class ConvertIco {
    public static int Main(string[] args) {
        string pngPath = @"D:\ZX-CODE-FREE-PLUS\resources\icons\favicon_source.png";
        string icoPath = @"D:\ZX-CODE-FREE-PLUS\resources\icons\favicon.ico";

        Image src = Image.FromFile(pngPath);
        Console.WriteLine("Source PNG: " + src.Width + "x" + src.Height);

        int[] sizes = { 256, 128, 64, 48, 32, 16 };
        byte[][] imageDataArray = new byte[sizes.Length][];

        for (int si = 0; si < sizes.Length; si++) {
            int size = sizes[si];

            // 创建缩放后的 Bitmap
            Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            Graphics g = Graphics.FromImage(bmp);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, 0, 0, size, size);
            g.Dispose();

            // 锁定像素数据 (System.Drawing 返回 top-down, BGRA)
            Rectangle rect = new Rectangle(0, 0, size, size);
            BitmapData bmpData = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] pixelBytes = new byte[size * size * 4];
            Marshal.Copy(bmpData.Scan0, pixelBytes, 0, pixelBytes.Length);
            bmp.UnlockBits(bmpData);
            bmp.Dispose();

            // 预乘 alpha (BGRA 顺序)
            for (int i = 0; i < pixelBytes.Length; i += 4) {
                byte a = pixelBytes[i + 3];
                if (a < 255) {
                    double factor = a / 255.0;
                    pixelBytes[i] = (byte)Math.Round(pixelBytes[i] * factor);
                    pixelBytes[i + 1] = (byte)Math.Round(pixelBytes[i + 1] * factor);
                    pixelBytes[i + 2] = (byte)Math.Round(pixelBytes[i + 2] * factor);
                }
            }

            // 关键修复：反转行顺序 (top-down → bottom-up)
            // BMP 格式要求 biHeight > 0 时像素从下到上存储
            int rowBytes = size * 4;
            byte[] bottomUpPixels = new byte[pixelBytes.Length];
            for (int y = 0; y < size; y++) {
                int srcOffset = y * rowBytes;           // top-down: row 0 = top
                int dstOffset = (size - 1 - y) * rowBytes; // bottom-up: row 0 = bottom
                Array.Copy(pixelBytes, srcOffset, bottomUpPixels, dstOffset, rowBytes);
            }

            // AND mask (每行 4 字节对齐)
            int andRowBytes = (int)Math.Ceiling(size / 8.0);
            andRowBytes = (int)Math.Ceiling(andRowBytes / 4.0) * 4;
            int andTotalBytes = andRowBytes * size;

            // BITMAPINFOHEADER (40 bytes)
            byte[] header = new byte[40];
            WriteUInt32(header, 0, 40);        // biSize
            WriteUInt32(header, 4, (uint)size); // biWidth
            WriteUInt32(header, 8, (uint)(size * 2)); // biHeight (双倍高度)
            WriteUInt16(header, 12, 1);        // biPlanes
            WriteUInt16(header, 14, 32);       // biBitCount

            // 合并: header + pixels(bottom-up) + AND mask
            byte[] andMask = new byte[andTotalBytes];
            byte[] imgData = new byte[40 + bottomUpPixels.Length + andTotalBytes];
            Array.Copy(header, 0, imgData, 0, 40);
            Array.Copy(bottomUpPixels, 0, imgData, 40, bottomUpPixels.Length);
            Array.Copy(andMask, 0, imgData, 40 + bottomUpPixels.Length, andTotalBytes);

            imageDataArray[si] = imgData;
            Console.WriteLine("  " + size + "x" + size + ": " + imgData.Length + " bytes (bottom-up)");
        }

        src.Dispose();

        // 构建 ICO 文件
        int imgCount = imageDataArray.Length;
        int dataStart = 6 + imgCount * 16;

        int totalLen = dataStart;
        foreach (byte[] d in imageDataArray) totalLen += d.Length;

        MemoryStream ms = new MemoryStream(totalLen);
        BinaryWriter bw = new BinaryWriter(ms);

        // ICONDIR
        bw.Write((ushort)0);       // reserved
        bw.Write((ushort)1);       // type (icon)
        bw.Write((ushort)imgCount); // count

        // ICONDIRENTRY[]
        int curOff = dataStart;
        for (int i = 0; i < imgCount; i++) {
            int sz = sizes[i];
            byte[] data = imageDataArray[i];
            byte szByte = (sz == 256) ? (byte)0 : (byte)sz;

            bw.Write(szByte);              // width
            bw.Write(szByte);              // height
            bw.Write((byte)0);             // colorCount
            bw.Write((byte)0);             // reserved
            bw.Write((ushort)1);           // planes
            bw.Write((ushort)32);          // bitCount
            bw.Write((uint)data.Length);   // bytesInRes
            bw.Write((uint)curOff);        // imageOffset
            curOff += data.Length;
        }

        // Image data
        for (int i = 0; i < imgCount; i++) {
            bw.Write(imageDataArray[i]);
        }

        bw.Flush();
        File.WriteAllBytes(icoPath, ms.ToArray());
        bw.Close();
        ms.Close();

        // 验证
        FileInfo fi = new FileInfo(icoPath);
        Console.WriteLine("");
        Console.WriteLine("Done! Size: " + Math.Round(fi.Length / 1024.0, 1) + " KB");

        byte[] vb = File.ReadAllBytes(icoPath);
        int vc = BitConverter.ToUInt16(vb, 4);
        Console.WriteLine("Verification: " + vc + " images");
        for (int i = 0; i < vc; i++) {
            int o = 6 + i * 16;
            int w2 = (vb[o] == 0) ? 256 : vb[o];
            int h2 = (vb[o + 1] == 0) ? 256 : vb[o + 1];
            int doff = BitConverter.ToInt32(vb, o + 12);
            bool isP = (vb[doff] == 0x89 && vb[doff + 1] == 0x50);
            string fmt = isP ? "PNG" : "BMP";
            int biHeight = BitConverter.ToInt32(vb, doff + 8);
            Console.WriteLine("  Image " + (i+1) + ": " + w2 + "x" + h2 + " format=" + fmt + " biHeight=" + biHeight);
        }

        return 0;
    }

    static void WriteUInt32(byte[] buf, int offset, uint val) {
        buf[offset] = (byte)(val & 0xFF);
        buf[offset+1] = (byte)((val >> 8) & 0xFF);
        buf[offset+2] = (byte)((val >> 16) & 0xFF);
        buf[offset+3] = (byte)((val >> 24) & 0xFF);
    }

    static void WriteUInt16(byte[] buf, int offset, ushort val) {
        buf[offset] = (byte)(val & 0xFF);
        buf[offset+1] = (byte)((val >> 8) & 0xFF);
    }
}
