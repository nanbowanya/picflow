
![picflow](./obpf.jpg)

**PicFlow** is not about "Picture Flow" (image workflow), but rather a comprehensive end-to-end content production toolkit that addresses challenges throughout the writing and publishing process: **P**ublish (article publishing), **I**mage (image management), A**i** (AI-powered creation), **C**lip (web clipping), and more.

## Product Vision

### Core Value

Solving the fragmentation pain points for Obsidian users in the content production pipeline:

*   **Difficult Collection**: Web clipping results in messy formatting, and images easily break (hotlink protection).
*   **Difficult Management**: Image hosting configuration is cumbersome, and switching between multiple environments is inconvenient.
*   **Difficult Creation**: Lacks convenient features for image generation and article polishing.
*   **Difficult Publishing**: Converting from Markdown to self-media platforms like WeChat Official Accounts and Zhihu requires repetitive formatting and manual image handling.

### Key Differentiators

1.  **Closed-Loop Ecosystem**: Seamlessly connects the entire chain from "web clipping" to "article rewriting" to "image hosting storage" to "one-click publishing."
2.  **PicGo-Free**: No background process required; the plugin uploads directly via built-in SDK.

### User Scenarios

To accommodate different user needs, the plugin supports the following combination scenarios:

1.  **Fetch Only**:
    *   Scenario: You come across a great article and simply want to save it to your local Obsidian vault without AI rewriting or publishing.
    *   Workflow: Enter URL -> Parse -> Save Markdown (with original image links or transfer to S3).
2.  **Rewrite Only**:
    *   Scenario: You've written a note and want to use AI to polish it or generate a summary and supporting images.
    *   Workflow: Select text -> AI Polish -> Replace/Append -> Insert at specified location.
3.  **Publish Only**:
    *   Scenario: You have existing local notes that you want to publish to self-media platforms like WeChat Official Accounts or Zhihu with one click.
    *   Workflow: Open note -> Click Publish -> Select Platform -> Success.
4.  **Full Process**:
    *   Scenario: Content curation + automated operations.
    *   Workflow: Enter URL -> Parse -> AI Rewrite -> Auto Publish.
