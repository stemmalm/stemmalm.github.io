# StemmaLM

Small language models raised from scratch on what adults say to children (AO-CHILDES, in order of the child's age), one snapshot per month of age, numbered into a lineage by strain, upbringing, generation, lesion and seed.

The site is static: the model runs in the visitor's browser (`stemma.js`), reading fp16 snapshots from [xchuanli/stemmalm-weights](https://huggingface.co/xchuanli/stemmalm-weights) (exported with `tools/export_web.py`). Names in replies are replaced by "(name)".

Training data: CHILDES (MacWhinney 2000) via AO-CHILDES (Huebner & Willits 2021), CC BY-NC-SA 4.0. Code and models are for non-commercial use.
