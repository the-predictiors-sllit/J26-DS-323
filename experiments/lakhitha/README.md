# Experiments

## System Overview

This document describes how the system works from training through end-user inference.

## Phase 1: Training

Training uses the labelled field dataset CSV and is divided into data collection, preprocessing, model training, and validation.

### 1. Data Collection

Collect 150–200 labelled photos. Each record should include:

- Filename
- Age
- Rated capacity
- Severity or health score
- Degradation category
- Real ground-truth health percentage for the 10–15 validation sites

### 2. Preprocessing

Apply the same preprocessing pipeline to every photo:

1. Crop the image to the panel.
2. Normalize lighting using CLAHE.
3. Resize the image.
4. Apply data augmentation.

### 3. Model Training

#### Stage 1: Image-Only Pretraining

Fine-tune the CNN backbone, such as ResNet or EfficientNet, on the public dataset's discrete categories: dust, snow, and damage.

This stage teaches the model general visual features related to surface condition. Age and rated capacity are not used because the public dataset does not contain paired age and capacity data.

#### Stage 2: Fused Fine-Tuning

1. Remove the classification head.
2. Extract the image embedding from the CNN.
3. Normalize `Age_Years` and `Rated_Capacity_kW`.
4. Concatenate the image embedding with the normalized age and capacity values.
5. Pass the combined features through new dense layers.
6. Train the model to output `Health_Score_0_100` using the field dataset labels.

### 4. Validation

Evaluate the model using:

- Held-out MAE and RMSE
- Pearson correlation against the real `Health_Percentage` from the ground-truth sites
- Inter-rater kappa for the labels
- An image-only versus fused-input ablation comparison

### 5. Explainability

Generate Grad-CAM from the CNN branch only. Age and capacity are scalar values rather than spatial data, so the heatmap shows where the visual portion of the decision came from. It does not and should not visualize the contribution of age or capacity.

## Phase 2: Inference

This is what happens when a user operates the tool:

1. The user uploads a photo and enters the rated capacity and installation date.
2. The system automatically computes `Age_Years` from the installation date using the current date. The user does not need to calculate it.
3. The photo passes through the same preprocessing pipeline used during training: crop, CLAHE, and resize.
4. The trained CNN extracts an image embedding from the photo.
5. The embedding is concatenated with the user's normalized age and rated capacity, using the same fusion structure as training.
6. The fused regression head outputs `Health_Score_0_100`.
7. The score is mapped to a health tier using the threshold table:
   - Healthy
   - Early
   - Moderate
   - Severe
8. Grad-CAM runs on the image branch and produces a heatmap overlay.
9. A separate surface-soiling check runs independently and produces a yes/no flag. This flag remains separate from the health tier according to the scope-boundary design.
10. The health score is applied to the user's rated capacity to calculate a predicted output range. For example, a 78% score produces approximately 338–356W for a 450W panel.
11. The system packages the final result for the user.

## Final User Result

The final result includes:

- Health score
- Health tier
- Detected issue
- Grad-CAM heatmap
- Predicted watt range
- Surface-soiling flag
- Recommendation
