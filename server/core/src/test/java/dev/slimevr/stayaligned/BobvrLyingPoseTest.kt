package dev.slimevr.stayaligned

import dev.slimevr.config.StayAlignedPoseConfig
import dev.slimevr.config.UserConfigData
import dev.slimevr.tracker.stayaligned.poses.PlayerPose
import dev.slimevr.tracker.stayaligned.poses.RelaxedPose
import solarxr_protocol.rpc.StayAlignedRelaxedPose
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class BobvrLyingPoseTest {
	private val flat = StayAlignedPoseConfig(recorded = true, enabled = true, upperLegAngleInDeg = 5f)
	private val lying = StayAlignedPoseConfig(recorded = true, enabled = true, upperLegAngleInDeg = 20f)

	@Test
	fun `lying on the back uses its own pose, sitting on the ground keeps FLAT`() {
		val config = UserConfigData(stayAlignedPoses = mapOf(StayAlignedRelaxedPose.FLAT to flat), bobvrLyingPose = lying)
		assertEquals(20f, RelaxedPose.forPose(PlayerPose.LYING_ON_BACK, config)!!.upperLeg.toDeg(), 0.01f)
		assertEquals(5f, RelaxedPose.forPose(PlayerPose.SITTING_ON_GROUND, config)!!.upperLeg.toDeg(), 0.01f)
	}

	@Test
	fun `without a lying pose FLAT is used, and the FLAT switch turns both off`() {
		val noLying = UserConfigData(stayAlignedPoses = mapOf(StayAlignedRelaxedPose.FLAT to flat))
		assertEquals(5f, RelaxedPose.forPose(PlayerPose.LYING_ON_BACK, noLying)!!.upperLeg.toDeg(), 0.01f)
		val off = UserConfigData(stayAlignedPoses = mapOf(StayAlignedRelaxedPose.FLAT to flat.copy(enabled = false)), bobvrLyingPose = lying)
		assertNull(RelaxedPose.forPose(PlayerPose.LYING_ON_BACK, off))
	}
}
