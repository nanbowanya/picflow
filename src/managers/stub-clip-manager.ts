
import { Notice } from "obsidian";
import { IClipManager, ClipResult } from "../interfaces";

export class StubClipManager implements IClipManager {
    fetchAndParse(_url: string): Promise<ClipResult> {
                   // eslint-disable-next-line obsidianmd/ui/sentence-case
        new Notice("Smart Clip is a Pro feature. Please upgrade to unlock.");
        return Promise.reject(new Error("Smart Clip is a Pro feature."));
    }
}
