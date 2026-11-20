#!/usr/bin/env python3
"""[2026-11-20] Synthetic fixtures for tools/test_seller_photo_editor_browser.mjs (never real product photos).
Run: python3 tools/fixtures/make_editor_fixtures.py
 - editor-product-edge-test.png  500x500: plain light background, product that TOUCHES the left border
                                  (edge protection), covering (140,300) and (250..310,300) (erase + undo)
 - editor-product-wide-test.png  500x300: plain background, product in the middle (rotate + explicit trim)
 - editor-product-plain-test.png 500x500: uniform white (background removal must refuse, not wipe)"""
import os
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__))
BG = (244, 244, 242)

def edge():
    im = Image.new('RGB', (500, 500), BG); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 170, 390, 420), radius=36, fill=(22, 128, 98))      # body touches x=0
    d.rounded_rectangle((60, 120, 300, 190), radius=20, fill=(201, 146, 42))     # lid
    d.rectangle((20, 280, 370, 300), fill=(11, 74, 58))                          # stripe through the erase line
    d.ellipse((200, 230, 330, 360), fill=(240, 205, 120))                        # label
    im.save(os.path.join(D, 'editor-product-edge-test.png'))

def wide():
    im = Image.new('RGB', (500, 300), BG); d = ImageDraw.Draw(im)
    d.rounded_rectangle((150, 90, 350, 210), radius=18, fill=(91, 141, 239))
    d.ellipse((215, 120, 285, 180), fill=(255, 255, 255))
    im.save(os.path.join(D, 'editor-product-wide-test.png'))

def plain():
    Image.new('RGB', (500, 500), (255, 255, 255)).save(os.path.join(D, 'editor-product-plain-test.png'))

if __name__ == '__main__':
    edge(); wide(); plain(); print('fixtures written')
