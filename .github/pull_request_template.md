# Code Review Checklist

## :clown_face: Assignee

### Request It

-   [ ] Include feature/story IDs to link this Pull Request with the related work item (e.g. `Closes #<issue>` or reference the DevOps story ID).
-   [ ] Ensure the working branch is up to date with changes from the target branch.
-   [ ] Verify the target branch for the pull request is correct.
-   [ ] Write a short synopsis of the work and design for the branch. At minimum, answer the following questions:
    -   What is the design intention behind the work done? If a bug, how was it resolved?
    -   What steps or information is needed for someone else to validate the code? For example, if fixing a bug with data validation include sample bad data.
    -   How would one describe the context of the work to someone unfamiliar with this section of code?
-   [ ] (_Optional_) Include screenshots for the UI to best exemplify the working changes.

### Summary of Changes

> Summarize the changes in this Pull Request. Be detailed but succinct.

### Related Feature / Story IDs

> List any linked features, stories, or issue numbers (e.g. `feature_1/story_2`, `#42`).

### Testing Performed

> Describe what testing was done to validate this change:
> - Unit tests added or updated (run `npm test` — all tests must pass)
> - Manual testing steps taken (steps to reproduce, environment, sample data)
> - Any edge cases exercised

## :smiling_imp: Reviewer

### Read It

-   [ ] Checkout the branch to be reviewed.
-   [ ] Ensure the project builds without errors or warnings (`npm run build`).
-   [ ] Ensure TypeScript compiles cleanly with no type errors (`npm run typecheck`).
-   [ ] Ensure lint passes with no errors or warnings (`npm run lint`).
-   [ ] Read through the changed code. Is/Does it:
    -   Easy to read and understand?
    -   Well organized and encapsulated?
    -   Have unit or integration tests (`.test.ts` / `.test.tsx`) that succeed?

### Break It

-   [ ] Run the solution locally (`npm run dev`).
-   [ ] Does anything not work immediately? E.g. install failures (`npm install`), crashes, etc.
-   [ ] Take actions which invoke the new code.
    -   Use the browser DevTools or a tool like Postman to test API endpoints with good _and_ bad data.
    -   Use the UI to test front-end behaviors (i.e. click buttons, submit forms, etc.)
-   [ ] Try obviously wrong things with the intent to cause breaking issues. Remember, users always find ways to break code, so break it first!

### Code Review Readiness Checklist

-   [ ] Tests have been added or updated to cover the changed behaviour.
-   [ ] Lint passes cleanly (`npm run lint` — zero errors, zero warnings).
-   [ ] TypeScript types compile without errors (`npm run typecheck`).
-   [ ] No `console.log` (or `console.debug` / `console.warn`) left in production code paths.
-   [ ] Follows naming conventions per the eTech TypeScript style guide (camelCase variables/functions, PascalCase components/types, UPPER_SNAKE_CASE constants).
-   [ ] No commented-out code left in the diff.
-   [ ] No debug artifacts left in the diff (e.g. `debugger` statements, hardcoded test credentials, temporary `TODO` comments that were not intentional).
-   [ ] npm packages required by this change have been added to `package.json` and committed (no undeclared dependencies).
-   [ ] `.ts` / `.tsx` files follow project conventions (no `any` escapes without a justifying comment, no non-null assertions without justification).

### Review It

-   [ ] Leave comments on the code in source control to document feedback.
-   [ ] Schedule a meeting with the reviewee. Make sure the timeframe is appropriate to the code being reviewed. Don't schedule an hour when the code adds a button.
-   [ ] Discuss feedback with the author. Remember, the goal is to teach, learn, and deliver the highest quality solution possible!
-   [ ] Work through problems and concerns together.

### Fix It

-   [ ] Reviewee updates code based on reviewer's feedback.
-   [ ] Repeat previous steps until no changes are necessary.

### Merge It

-   [ ] Reviewer and reviewee merge the story branch into the main feature branch together.
-   [ ] As a team, work through any merge conflicts.
-   [ ] Checkout the main feature branch after the merge and test to ensure the functionality still works as expected (see the Break It step).
-   [ ] Close the story in DevOps.
