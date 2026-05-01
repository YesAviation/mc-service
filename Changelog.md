# Changelog

Follow here for all changes to this project. This file is intended to be a comprehensive list of all changes, including bug fixes, new features, and any other modifications.

## Changed

- [2026-04-30] Title: Metadata
    - The `ingestion` service was primarily responsible for all metadata actions. I was uncomfortable with this and decided to create a separate `metadata` service that handles all metadata-related actions. This change allows for better separation of concerns and makes the codebase more organized. 

- [2026-04-29] Title: Custom Metadata Handler
    - In the event metadata was incorrect, there was no way to handle it. Now implemented, you can go to the admin panel and add or edit custom metadata information. The admin can edits individual songs, albums, and artists. Admins can now point the program to the correct iTunes metadata source, or add their own custom metadata. Admins can also add custom artwork for songs, albums, and artists. 

## Fixed