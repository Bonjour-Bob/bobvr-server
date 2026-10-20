package dev.slimevr.config

import dev.slimevr.VRServer

class FiltersConfig {

	// Type of filtering applied (none, smoothing or prediction)
	// SlimeVR Mod: no filtering by default (1:1 tracking)
	var type = "none"

	// Amount/Intensity of the specified filtering (0 to 1)
	var amount = 0.2f

	fun updateTrackersFilters() {
		for (tracker in VRServer.instance.allTrackers) {
			if (tracker.allowFiltering) {
				tracker.filteringHandler.readFilteringConfig(this, tracker.getRotation())
			}
		}
	}
}
