package dev.slimevr.tracking.trackers

import com.jme3.math.FastMath
import io.github.axisangles.ktmath.EulerAngles
import io.github.axisangles.ktmath.EulerOrder
import io.github.axisangles.ktmath.Quaternion

/**
 * Body pose the player is in during a full reset (SlimeVR Mod).
 *
 * A normal full reset assumes the player stands straight, so every tracker is
 * reset to identity. For the other poses, the bones that are not straight get
 * their real orientation at reset time instead, relative to the HMD's yaw.
 */
enum class ResetPose {
	/** Standing straight, the default full reset */
	STANDING,

	/** Sitting on a chair: thighs forward, shins and back straight */
	SITTING,

	/** Lying on the back: the whole body tilted backward, face up */
	LYING,
	;

	/**
	 * The rotation of the bone the tracker is on, in this pose, compared to
	 * standing straight.
	 */
	fun rotationFor(position: TrackerPosition?): Quaternion = when (this) {
		STANDING -> Quaternion.IDENTITY

		SITTING -> when (position) {
			TrackerPosition.LEFT_UPPER_LEG, TrackerPosition.RIGHT_UPPER_LEG -> PITCH_FORWARD

			else -> Quaternion.IDENTITY
		}

		LYING -> if (position == null) Quaternion.IDENTITY else PITCH_FORWARD
	}

	companion object {
		/**
		 * 90 degrees around the left-right axis: a bone pointing down ends up
		 * pointing forward (-Z), and a standing body ends up lying on its back.
		 */
		private val PITCH_FORWARD = EulerAngles(EulerOrder.YZX, FastMath.HALF_PI, 0f, 0f).toQuaternion()
	}
}
