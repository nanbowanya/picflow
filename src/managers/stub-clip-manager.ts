
import { Notice } from "obsidian";
import { IClipManager, ClipResult } from "../interfaces";

export class StubClipManager implements IClipManager {
    async fetchAndParse(url: string): Promise<ClipResult> {
        new Notice("Smart Clip is a Pro feature. Please upgrade to unlock.");
        throw new Error("Smart Clip is a Pro feature.");
    }
}
