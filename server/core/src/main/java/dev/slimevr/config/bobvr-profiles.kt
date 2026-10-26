package dev.slimevr.config

import solarxr_protocol.rpc.FilteringType

// BOBvr: the mod's settings profiles (left bar buttons and the profile switcher)
const val MOD_PROFILE_NORMAL = "Normal"
const val MOD_PROFILE_DANCE = "Danse"
const val MOD_PROFILE_ORIGIN = "Origine"
val MOD_PROFILES = listOf(MOD_PROFILE_NORMAL, MOD_PROFILE_DANCE, MOD_PROFILE_ORIGIN)

/** The settings of a mod profile, keeping everything else from [base] */
fun modProfileSettings(name: String, base: SettingsConfigState): SettingsConfigState {
	val upstream = SettingsConfigState()
	return when (name) {
		// Like official SlimeVR, with the mod's corrections off
		MOD_PROFILE_ORIGIN -> base.copy(
			skeletonConfig = upstream.skeletonConfig.copy(toggles = upstream.skeletonConfig.toggles.copy(modCorrections = false)),
			resetsConfig = base.resetsConfig.copy(yawResetSmoothTime = upstream.resetsConfig.yawResetSmoothTime),
		)

		// Normal: light smoothing so bending the knee and lifting the leg isn't jerky.
		// Dance: light prediction, a bit more reactive. Both: feet held by the skating
		// correction only (no floor clip / foot plant / toe snap), no joint limits (small
		// blocks when turning the hips low), smooth double tap reset.
		else -> base.copy(
			skeletonConfig = base.skeletonConfig.copy(
				toggles = base.skeletonConfig.toggles.copy(
					floorClip = false,
					skatingCorrection = true,
					toeSnap = false,
					footPlant = false,
					enforceConstraints = false,
					modCorrections = true,
				),
				ratios = base.skeletonConfig.ratios.copy(skatingCorrectionStrength = 0.3f),
				filtering = if (name == MOD_PROFILE_DANCE) {
					SkeletonFilteringConfig(type = FilteringType.PREDICTION, amount = 0.2f)
				} else {
					SkeletonFilteringConfig(type = FilteringType.SMOOTHING, amount = 0.25f)
				},
			),
			resetsConfig = base.resetsConfig.copy(yawResetSmoothTime = 0.2f),
		)
	}
}
