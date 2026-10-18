package dev.slimevr.config;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.StdKeySerializers;
import dev.slimevr.config.serializers.BooleanMapDeserializer;
import dev.slimevr.tracking.trackers.TrackerRole;
import java.util.HashMap;
import java.util.Map;


public class BridgeConfig {

	@JsonDeserialize(using = BooleanMapDeserializer.class)
	@JsonSerialize(keyUsing = StdKeySerializers.StringKeySerializer.class)
	public Map<String, Boolean> trackers = new HashMap<>();
	public boolean automaticSharedTrackersToggling = true;

	public BridgeConfig() {
	}

	public boolean getBridgeTrackerRole(TrackerRole role, boolean def) {
		return trackers.getOrDefault(role.name().toLowerCase(), def);
	}

	public void setBridgeTrackerRole(TrackerRole role, boolean val) {
		this.trackers.put(role.name().toLowerCase(), val);
	}

	/**
	 * Same as {@link #getBridgeTrackerRole} but for outputs that have no
	 * TrackerRole of their own (like the extra ankle trackers).
	 */
	public boolean getBridgeTrackerKey(String key, boolean def) {
		return trackers.getOrDefault(key, def);
	}

	public Map<String, Boolean> getTrackers() {
		return trackers;
	}
}
