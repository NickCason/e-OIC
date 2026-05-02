// loadingPhrases — per-context flavor strings shown while the user
// waits. Each library is tuned to the operation: building exports
// leans on photography + packaging metaphors, parsing leans on
// translation + decipherment, etc. Curated to land in a steering-
// committee demo: half jargon, half winks, none unprofessional.

export const PHRASES = {
  // 'general' — fallback / ambient (also used wherever no set is given).
  general: [
    'Settling things straight…',
    'Getting ducks into a row…',
    'Auditing investigation…',
    'Finding typos (just kidding)…',
    'Naming things (the hard part)…',
    'Crossing t’s, dotting i’s…',
    'Reticulating splines…',
    'Polishing takeaways…',
    'Hedging against scope creep…',
    'Asking the senior PE…',
    'Defragmenting field notes…',
    'Color-coding chaos…',
    'Cataloging the catalog…',
    'Re-reading the SOW…',
    'Aligning panel labels…',
  ],

  // 'export' — building the .zip / .xlsx deliverable. Office /
  // packaging / audit metaphors — distinct from 'photo' which owns
  // camera/darkroom imagery.
  export: [
    'Reframing that masterpiece…',
    'Stamping the cover page…',
    'Packaging the deliverables…',
    'Tying off the bow…',
    'Cataloging the audit…',
    'Compressing carefully…',
    'Hand-binding the report…',
    'Sealing the envelope…',
    'Tagging the metadata…',
    'Boxing it up neatly…',
    'Watermarking the proofs…',
    'Wrapping the deliverable…',
    'Indexing the contents…',
    'Bundling for SharePoint…',
    'Polishing the executive summary…',
    'Inking the project stamp…',
    'Filing the field notes…',
    'Drafting the table of contents…',
    'Stapling the addendum…',
    'Numbering the appendices…',
  ],

  // 'parse' — first-time read of an unknown xlsx. Translation +
  // decipherment metaphors.
  parse: [
    'Deciphering hieroglyphs…',
    'Translating from Excel…',
    'Identifying species…',
    'Disambiguating column headers…',
    'Negotiating with merged cells…',
    'Hunting for hidden sheets…',
    'Filtering the formulas…',
    'Extracting plain meaning…',
    'Surveying the rows…',
    'Reading between the cells…',
    'Inferring the schema…',
    'Cross-checking against template…',
    'Sniffing for data types…',
    'Trimming whitespace forever…',
    'Auditing the inputs…',
    'Indexing identifiers…',
    'Counting the columns…',
    'Decoding the headers…',
    'Recognizing the format…',
    'Carbon-dating the file…',
  ],

  // 'diff' — comparing local state against incoming xlsx (push or pull).
  diff: [
    'Spotting the deltas…',
    'Comparing snapshots…',
    'Reconciling differences…',
    'Aligning timelines…',
    'Diffing the diffs…',
    'Finding the changes…',
    'Tallying additions…',
    'Tallying removals…',
    'Cross-referencing versions…',
    'Tracking provenance…',
    'Mapping moves…',
    'Highlighting conflicts…',
    'Negotiating with two truths…',
    'Spotting the typo…',
    'Following the trail…',
    'Lining up the rows…',
    'Matching by name…',
    'Adjudicating disputes…',
    'Annotating the merges…',
    'Holding both versions up to the light…',
  ],

  // 'apply' — committing changes to local state (resync, push).
  apply: [
    'Stitching the seams…',
    'Welding the joints…',
    'Sealing the deliverables…',
    'Stamping it final…',
    'Merging the branches…',
    'Integrating updates…',
    'Reconciling the books…',
    'Closing out the punchlist…',
    'Filing the amendments…',
    'Updating the as-builts…',
    'Approving the redlines…',
    'Posting the entries…',
    'Promoting to canonical…',
    'Tagging the version…',
    'Locking it in…',
    'Confirming the changes…',
    'Saving the truth…',
    'Putting it on the record…',
    'Re-binding the report…',
    'Counter-signing for the record…',
  ],

  // 'build' — creating a new job structure from parsed xlsx.
  build: [
    'Raising the cabinet…',
    'Pouring the foundation…',
    'Framing the panels…',
    'Hanging the schematic…',
    'Roughing in the structure…',
    'Tagging the rooms…',
    'Spinning up the job…',
    'Pre-staging the panels…',
    'Initializing the binder…',
    'Pulling permits (kidding)…',
    'Onboarding the rows…',
    'Hatching the new job…',
    'Naming the job (carefully)…',
    'Establishing the baseline…',
    'Writing the first entry…',
    'Booting up the binder…',
    'Stamping the spine…',
    'Reserving the cabinet number…',
    'Drafting the first draft…',
    'Wiring the empty cabinet…',
  ],

  // 'photo' — processing imported / captured images.
  photo: [
    'Metering the light…',
    'Developing in the darkroom…',
    'Tagging the geo…',
    'Compressing the JPEG…',
    'Reading the EXIF…',
    'Auto-leveling the horizon…',
    'Resizing thoughtfully…',
    'Naming the file…',
    'Stenciling the panel name…',
    'Captioning carefully…',
    'Cropping conservatively…',
    'Color-correcting…',
    'Flagging the blurry ones…',
    'Verifying the focus…',
    'Filing under the row…',
    'Stamping the timestamp…',
    'Mounting on the contact sheet…',
    'Spotting the dust bunnies…',
    'Reading the negative…',
    'Saving to the binder…',
  ],
};

export function pickPhrase(setName = 'general', exclude = []) {
  const list = PHRASES[setName] || PHRASES.general;
  const pool = list.filter((p) => !exclude.includes(p));
  const final = pool.length ? pool : list;
  return final[Math.floor(Math.random() * final.length)];
}

// Back-compat: existing imports of LOADING_PHRASES should still work.
export const LOADING_PHRASES = PHRASES.general;
